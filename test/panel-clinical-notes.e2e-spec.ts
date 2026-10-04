import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { OutboxDispatcherService } from '../src/outbox/outbox-dispatcher.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { FakeEmailSender } from './helpers/fake-email-sender.js';
import { seedEducator, seedPreferences } from './helpers/fixtures.js';

/** Lunes 5 de octubre de 2026, 19:00 en Chile. */
const STARTS_AT = new Date('2026-10-05T22:00:00Z');

describe('Panel ficha clínica (e2e, spec 007)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let dispatcher: OutboxDispatcherService;
  let token: string;
  const sender = new FakeEmailSender();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ emailSender: sender }));
    dispatcher = app.get(OutboxDispatcherService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await seedPreferences(prisma);
    await seedEducator(prisma, {
      email: 'loreto@example.com',
      password: 'clave12345678',
    });
    const login = await request(app.getHttpServer())
      .post('/api/panel/auth/login')
      .send({ email: 'loreto@example.com', password: 'clave12345678' });
    token = login.body.token;
    sender.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => `Bearer ${token}`;
  const http = () => request(app.getHttpServer());

  async function seedChild(
    guardianEmail = 'ana@correo.cl',
    childName = 'Sofía',
  ) {
    const guardian = await prisma.guardian.upsert({
      where: { email: guardianEmail },
      create: {
        name: 'Ana Pérez',
        email: guardianEmail,
        phone: '+56911111111',
      },
      update: {},
    });
    const child = await prisma.child.create({
      data: {
        guardianId: guardian.id,
        name: childName,
        normalizedName: childName.toLowerCase(),
        age: 8,
      },
    });
    return { guardian, child };
  }

  async function seedSession(
    childId: string,
    guardianId: string,
    startsAt = STARTS_AT,
  ) {
    return prisma.session.create({
      data: {
        childId,
        guardianId,
        startsAt,
        status: 'CONFIRMED',
        confirmToken: `c-${startsAt.getTime()}-${childId}`,
        cancelToken: `x-${startsAt.getTime()}-${childId}`,
        createdBy: 'EDUCATOR',
      },
    });
  }

  const validNote = (overrides: Record<string, unknown> = {}) => ({
    date: '2026-10-05',
    title: 'Trabajamos lectura',
    body: 'Practicó sílabas.',
    notifyGuardian: false,
    ...overrides,
  });

  describe('autenticación', () => {
    it.each([
      ['get', '/api/panel/children/x/notes'],
      ['post', '/api/panel/children/x/notes'],
      ['get', '/api/panel/children/x/notes.pdf'],
      ['patch', '/api/panel/notes/x'],
      ['delete', '/api/panel/notes/x'],
    ] as const)(
      '%s %s sin token responde 401 NO_SESSION',
      async (method, path) => {
        const res = await http()[method](path);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('NO_SESSION');
      },
    );
  });

  describe('POST /api/panel/children/:id/notes', () => {
    it('crea el registro y lo devuelve con la forma del contrato', async () => {
      const { child } = await seedChild();

      const res = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote());

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        childId: child.id,
        date: '2026-10-05',
        title: 'Trabajamos lectura',
        body: 'Practicó sílabas.',
        sessionId: null,
        session: null,
        guardianNotified: false,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('guarda el día de calendario tal cual, sin correrlo por la zona horaria', async () => {
      const { child } = await seedChild();
      for (const date of ['2026-01-01', '2026-12-31', '2026-10-04']) {
        const res = await http()
          .post(`/api/panel/children/${child.id}/notes`)
          .set('Authorization', auth())
          .send(validNote({ date }));
        expect(res.body.date).toBe(date);
      }
    });

    it('recorta espacios del título y del texto', async () => {
      const { child } = await seedChild();
      const res = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ title: '  Título  ', body: '\n Texto \n' }));
      expect(res.body).toMatchObject({ title: 'Título', body: 'Texto' });
    });

    it('con una sesión del niño la devuelve vinculada', async () => {
      const { child, guardian } = await seedChild();
      const session = await seedSession(child.id, guardian.id);

      const res = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ sessionId: session.id }));

      expect(res.status).toBe(201);
      expect(res.body.sessionId).toBe(session.id);
      expect(res.body.session).toEqual({
        date: '2026-10-05',
        time: '19:00',
        status: 'CONFIRMED',
      });
    });

    it('con notifyGuardian=true deja una fila CLINICAL_NOTE para el email del apoderado', async () => {
      const { child, guardian } = await seedChild();

      const res = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ notifyGuardian: true }));

      expect(res.status).toBe(201);
      expect(res.body.guardianNotified).toBe(true);
      const rows = await prisma.outboxEmail.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: 'CLINICAL_NOTE',
        recipient: guardian.email,
        clinicalNoteId: res.body.id,
        sessionId: null,
        status: 'PENDING',
      });
    });

    it('con notifyGuardian=false no deja fila en el outbox', async () => {
      const { child } = await seedChild();
      await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ notifyGuardian: false }))
        .expect(201);
      expect(await prisma.outboxEmail.count()).toBe(0);
    });

    it('notifyGuardian es obligatorio', async () => {
      const { child } = await seedChild();
      const { notifyGuardian: _omit, ...withoutFlag } = validNote();
      const res = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(withoutFlag);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await prisma.clinicalNote.count()).toBe(0);
    });

    it.each([
      ['título vacío', { title: '   ' }],
      ['título de 121 caracteres', { title: 'a'.repeat(121) }],
      ['texto vacío', { body: '' }],
      ['texto de 10.001 caracteres', { body: 'a'.repeat(10_001) }],
      ['fecha con otro formato', { date: '05-10-2026' }],
      ['fecha que no existe', { date: '2026-02-31' }],
      ['sin fecha', { date: undefined }],
      ['notifyGuardian que no es booleano', { notifyGuardian: 'si' }],
    ])('rechaza %s con 400', async (_name, overrides) => {
      const { child } = await seedChild();
      const res = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote(overrides));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await prisma.clinicalNote.count()).toBe(0);
    });

    it('acepta el máximo permitido', async () => {
      const { child } = await seedChild();
      await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ title: 'a'.repeat(120), body: 'b'.repeat(10_000) }))
        .expect(201);
    });

    it('niño inexistente responde 404 CHILD_NOT_FOUND', async () => {
      const res = await http()
        .post('/api/panel/children/no-existe/notes')
        .set('Authorization', auth())
        .send(validNote());
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CHILD_NOT_FOUND');
    });

    it('una sesión de otro niño responde 422 y no crea nada (ni correo)', async () => {
      const { child } = await seedChild('ana@correo.cl', 'Sofía');
      const other = await seedChild('luis@correo.cl', 'Mateo');
      const foreign = await seedSession(other.child.id, other.guardian.id);

      const res = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ sessionId: foreign.id, notifyGuardian: true }));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('NOTE_SESSION_MISMATCH');
      expect(await prisma.clinicalNote.count()).toBe(0);
      expect(await prisma.outboxEmail.count()).toBe(0);
    });

    it('una sesión inexistente responde 422 NOTE_SESSION_MISMATCH', async () => {
      const { child } = await seedChild();
      const res = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ sessionId: 'no-existe' }));
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('NOTE_SESSION_MISMATCH');
    });
  });

  describe('GET /api/panel/children/:id/notes', () => {
    it('sin registros devuelve la lista vacía con el niño y el apoderado', async () => {
      const { child, guardian } = await seedChild();
      const res = await http()
        .get(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        child: { id: child.id, guardianId: guardian.id, name: 'Sofía', age: 8 },
        guardian: {
          id: guardian.id,
          name: 'Ana Pérez',
          email: 'ana@correo.cl',
          phone: '+56911111111',
        },
        notes: [],
      });
    });

    it('ordena por fecha descendente y, a igual fecha, el último creado primero', async () => {
      const { child } = await seedChild();
      const create = async (title: string, date: string) =>
        http()
          .post(`/api/panel/children/${child.id}/notes`)
          .set('Authorization', auth())
          .send(validNote({ title, date }))
          .expect(201);
      await create('antigua', '2026-09-01');
      await create('mismo día A', '2026-10-05');
      await create('mismo día B', '2026-10-05');
      await create('futura', '2026-11-01');

      const res = await http()
        .get(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth());

      expect(res.body.notes.map((n: { title: string }) => n.title)).toEqual([
        'futura',
        'mismo día B',
        'mismo día A',
        'antigua',
      ]);
    });

    it('no mezcla los registros de dos niños', async () => {
      const a = await seedChild('ana@correo.cl', 'Sofía');
      const b = await seedChild('luis@correo.cl', 'Mateo');
      await http()
        .post(`/api/panel/children/${a.child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ title: 'de Sofía' }));
      await http()
        .post(`/api/panel/children/${b.child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ title: 'de Mateo' }));

      const res = await http()
        .get(`/api/panel/children/${a.child.id}/notes`)
        .set('Authorization', auth());

      expect(res.body.notes.map((n: { title: string }) => n.title)).toEqual([
        'de Sofía',
      ]);
    });

    it('niño inexistente responde 404 CHILD_NOT_FOUND', async () => {
      const res = await http()
        .get('/api/panel/children/no-existe/notes')
        .set('Authorization', auth());
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CHILD_NOT_FOUND');
    });
  });

  describe('PATCH /api/panel/notes/:id', () => {
    async function createNote(
      childId: string,
      overrides: Record<string, unknown> = {},
    ) {
      const res = await http()
        .post(`/api/panel/children/${childId}/notes`)
        .set('Authorization', auth())
        .send(validNote(overrides))
        .expect(201);
      return res.body as { id: string; updatedAt: string };
    }

    it('edita los campos que vienen y deja los demás', async () => {
      const { child } = await seedChild();
      const note = await createNote(child.id);

      const res = await http()
        .patch(`/api/panel/notes/${note.id}`)
        .set('Authorization', auth())
        .send({ title: 'Título nuevo', date: '2026-10-06' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: note.id,
        title: 'Título nuevo',
        date: '2026-10-06',
        body: 'Practicó sílabas.',
      });
    });

    it('vincula una sesión del niño y con sessionId null la desvincula', async () => {
      const { child, guardian } = await seedChild();
      const session = await seedSession(child.id, guardian.id);
      const note = await createNote(child.id);

      const linked = await http()
        .patch(`/api/panel/notes/${note.id}`)
        .set('Authorization', auth())
        .send({ sessionId: session.id });
      expect(linked.body.sessionId).toBe(session.id);
      expect(linked.body.session).toMatchObject({
        date: '2026-10-05',
        time: '19:00',
      });

      const unlinked = await http()
        .patch(`/api/panel/notes/${note.id}`)
        .set('Authorization', auth())
        .send({ sessionId: null });
      expect(unlinked.body.sessionId).toBeNull();
      expect(unlinked.body.session).toBeNull();
    });

    it('un cuerpo vacío no cambia nada', async () => {
      const { child } = await seedChild();
      const note = await createNote(child.id);
      const res = await http()
        .patch(`/api/panel/notes/${note.id}`)
        .set('Authorization', auth())
        .send({});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        title: 'Trabajamos lectura',
        body: 'Practicó sílabas.',
      });
    });

    it('nunca escribe en el outbox, ni aunque llegue notifyGuardian', async () => {
      const { child } = await seedChild();
      const note = await createNote(child.id, { notifyGuardian: false });

      await http()
        .patch(`/api/panel/notes/${note.id}`)
        .set('Authorization', auth())
        .send({ title: 'Editado', notifyGuardian: true })
        .expect(200);

      expect(await prisma.outboxEmail.count()).toBe(0);
      const stored = await prisma.clinicalNote.findUniqueOrThrow({
        where: { id: note.id },
      });
      expect(stored.guardianNotified).toBe(false);
    });

    it('editar un registro ya notificado no agrega filas', async () => {
      const { child } = await seedChild();
      const note = await createNote(child.id, { notifyGuardian: true });
      expect(await prisma.outboxEmail.count()).toBe(1);

      await http()
        .patch(`/api/panel/notes/${note.id}`)
        .set('Authorization', auth())
        .send({ body: 'Corregido.' });

      expect(await prisma.outboxEmail.count()).toBe(1);
    });

    it('una sesión de otro niño responde 422 y no cambia el registro', async () => {
      const { child } = await seedChild('ana@correo.cl', 'Sofía');
      const other = await seedChild('luis@correo.cl', 'Mateo');
      const foreign = await seedSession(other.child.id, other.guardian.id);
      const note = await createNote(child.id);

      const res = await http()
        .patch(`/api/panel/notes/${note.id}`)
        .set('Authorization', auth())
        .send({ title: 'No debe guardarse', sessionId: foreign.id });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('NOTE_SESSION_MISMATCH');
      const stored = await prisma.clinicalNote.findUniqueOrThrow({
        where: { id: note.id },
      });
      expect(stored.title).toBe('Trabajamos lectura');
    });

    it.each([
      ['título vacío', { title: '' }],
      ['texto muy largo', { body: 'a'.repeat(10_001) }],
      ['fecha inválida', { date: '2026-13-01' }],
    ])('rechaza %s con 400', async (_name, patch) => {
      const { child } = await seedChild();
      const note = await createNote(child.id);
      const res = await http()
        .patch(`/api/panel/notes/${note.id}`)
        .set('Authorization', auth())
        .send(patch);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('registro inexistente responde 404 NOTE_NOT_FOUND', async () => {
      const res = await http()
        .patch('/api/panel/notes/no-existe')
        .set('Authorization', auth())
        .send({ title: 'x' });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOTE_NOT_FOUND');
    });
  });

  describe('DELETE /api/panel/notes/:id', () => {
    it('borra el registro (204) y un segundo borrado responde 404', async () => {
      const { child } = await seedChild();
      const created = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote());

      await http()
        .delete(`/api/panel/notes/${created.body.id}`)
        .set('Authorization', auth())
        .expect(204);
      expect(await prisma.clinicalNote.count()).toBe(0);

      const again = await http()
        .delete(`/api/panel/notes/${created.body.id}`)
        .set('Authorization', auth());
      expect(again.status).toBe(404);
      expect(again.body.code).toBe('NOTE_NOT_FOUND');
    });

    it('borrar la sesión vinculada no borra el registro: queda sin sesión', async () => {
      const { child, guardian } = await seedChild();
      const session = await seedSession(child.id, guardian.id);
      const created = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ sessionId: session.id }));

      await prisma.session.delete({ where: { id: session.id } });

      const stored = await prisma.clinicalNote.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.sessionId).toBeNull();
    });
  });

  describe('correo al apoderado (de punta a punta)', () => {
    it('crear con notifyGuardian=true y despachar envía el registro al apoderado', async () => {
      const { child } = await seedChild();
      await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ notifyGuardian: true }))
        .expect(201);

      expect(await dispatcher.dispatchOnce()).toEqual({
        sent: 1,
        retried: 0,
        failed: 0,
        skipped: 0,
      });

      expect(sender.sent).toHaveLength(1);
      const [email] = sender.sent;
      expect(email.to).toBe('ana@correo.cl');
      expect(email.subject).toBe('Nuevo registro en la ficha de Sofía');
      expect(email.text).toContain('Trabajamos lectura');
      expect(email.text).toContain('lunes 5 de octubre');
      // No lleva datos de otras familias.
      expect(email.text).not.toContain('loreto@example.com');
    });

    it('editar antes del despacho: llega el texto corregido y no se envía un segundo correo', async () => {
      const { child } = await seedChild();
      const created = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ notifyGuardian: true }));
      await http()
        .patch(`/api/panel/notes/${created.body.id}`)
        .set('Authorization', auth())
        .send({ body: 'Texto corregido.' });

      await dispatcher.dispatchOnce();
      await dispatcher.dispatchOnce();

      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0].text).toContain('Texto corregido.');
    });

    it('borrar antes del despacho deja la fila SKIPPED y no envía nada', async () => {
      const { child } = await seedChild();
      const created = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ notifyGuardian: true }));
      await http()
        .delete(`/api/panel/notes/${created.body.id}`)
        .set('Authorization', auth())
        .expect(204);

      expect(await dispatcher.dispatchOnce()).toEqual({
        sent: 0,
        retried: 0,
        failed: 0,
        skipped: 1,
      });

      expect(sender.sent).toHaveLength(0);
      const row = await prisma.outboxEmail.findFirstOrThrow();
      expect(row.status).toBe('SKIPPED');
    });

    it('no manda correo a la educadora ni deja avisos en su campana', async () => {
      const { child } = await seedChild();
      await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote({ notifyGuardian: true }));
      await dispatcher.dispatchOnce();

      expect(sender.sent.map((e) => e.to)).toEqual(['ana@correo.cl']);
      const bell = await http()
        .get('/api/panel/notifications')
        .set('Authorization', auth());
      expect(bell.status).toBe(200);
      expect(bell.body).toMatchObject({ items: [], unreadCount: 0 });
    });
  });

  describe('GET /api/panel/children/:id/notes.pdf', () => {
    /** Lee el cuerpo binario (supertest lo trataría como texto y lo corrompería). */
    const binary = (
      res: request.Response,
      done: (err: Error | null, body: Buffer) => void,
    ) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    };

    const fetchPdf = (childId: string) =>
      http()
        .get(`/api/panel/children/${childId}/notes.pdf`)
        .set('Authorization', auth())
        .buffer(true)
        .parse(binary);

    it('descarga un PDF con los headers de adjunto y el nombre del niño', async () => {
      const { child } = await seedChild('ana@correo.cl', 'Tomás Núñez');
      await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote());

      const res = await fetchPdf(child.id);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="ficha-tomas-nunez-\d{4}-\d{2}-\d{2}\.pdf"$/,
      );
      expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('con 0 registros también responde 200 con un PDF', async () => {
      const { child } = await seedChild();
      const res = await fetchPdf(child.id);
      expect(res.status).toBe(200);
      expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('incluye todos los registros: el PDF crece con cada uno', async () => {
      const { child } = await seedChild();
      const empty = (await fetchPdf(child.id)).body as Buffer;
      for (const title of ['Uno', 'Dos', 'Tres']) {
        await http()
          .post(`/api/panel/children/${child.id}/notes`)
          .set('Authorization', auth())
          .send(validNote({ title, body: `Texto de ${title}. `.repeat(50) }));
      }
      const full = (await fetchPdf(child.id)).body as Buffer;
      expect(full.length).toBeGreaterThan(empty.length);
    });

    it('un registro largo con muchos saltos de línea no rompe la exportación', async () => {
      const { child } = await seedChild();
      await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(
          validNote({
            body: 'Línea de trabajo con varias palabras.\n'.repeat(250),
          }),
        )
        .expect(201);

      const res = await fetchPdf(child.id);
      expect(res.status).toBe(200);
      expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('niño inexistente responde 404 CHILD_NOT_FOUND en JSON', async () => {
      const res = await http()
        .get('/api/panel/children/no-existe/notes.pdf')
        .set('Authorization', auth());
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CHILD_NOT_FOUND');
    });

    it('exportar no escribe en el outbox ni cambia los registros', async () => {
      const { child } = await seedChild();
      await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote());
      const before = await prisma.clinicalNote.findFirstOrThrow();

      await fetchPdf(child.id);

      expect(await prisma.outboxEmail.count()).toBe(0);
      expect(await prisma.clinicalNote.findFirstOrThrow()).toEqual(before);
    });
  });

  describe('GET /api/panel/guardians/:id (notesCount)', () => {
    it('trae la cantidad de registros de cada niño', async () => {
      const { child: sofia, guardian } = await seedChild(
        'ana@correo.cl',
        'Sofía',
      );
      const mateo = await prisma.child.create({
        data: {
          guardianId: guardian.id,
          name: 'Mateo',
          normalizedName: 'mateo',
          age: 6,
        },
      });
      const otraFamilia = await seedChild('luis@correo.cl', 'Pedro');
      for (const [childId, count] of [
        [sofia.id, 3],
        [otraFamilia.child.id, 5],
      ] as const) {
        for (let i = 0; i < count; i++) {
          await http()
            .post(`/api/panel/children/${childId}/notes`)
            .set('Authorization', auth())
            .send(validNote({ title: `Registro ${i}` }))
            .expect(201);
        }
      }

      const res = await http()
        .get(`/api/panel/guardians/${guardian.id}`)
        .set('Authorization', auth());

      expect(res.status).toBe(200);
      const counts = Object.fromEntries(
        res.body.children.map((c: { id: string; notesCount: number }) => [
          c.id,
          c.notesCount,
        ]),
      );
      // Solo cuenta los de sus propios niños: ni los de otra familia ni los del hermano.
      expect(counts).toEqual({ [sofia.id]: 3, [mateo.id]: 0 });
    });

    it('al borrar un registro baja la cuenta', async () => {
      const { child, guardian } = await seedChild();
      const created = await http()
        .post(`/api/panel/children/${child.id}/notes`)
        .set('Authorization', auth())
        .send(validNote());
      await http()
        .delete(`/api/panel/notes/${created.body.id}`)
        .set('Authorization', auth())
        .expect(204);

      const res = await http()
        .get(`/api/panel/guardians/${guardian.id}`)
        .set('Authorization', auth());
      expect(res.body.children[0].notesCount).toBe(0);
    });
  });
});
