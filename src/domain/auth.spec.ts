import { normalizeEmail, PASSWORD_MIN_LENGTH } from './auth.js';

describe('normalizeEmail', () => {
  it('recorta espacios y pasa a minúsculas', () => {
    expect(normalizeEmail('  Nombre@Correo.CL  ')).toBe('nombre@correo.cl');
  });

  it('hace que dos variantes del mismo correo normalicen igual', () => {
    expect(normalizeEmail('Correo@Ejemplo.cl')).toBe(normalizeEmail('correo@ejemplo.cl'));
  });
});

describe('PASSWORD_MIN_LENGTH', () => {
  it('es 8, como en el mock original', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});
