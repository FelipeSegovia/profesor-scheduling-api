import { buildCorsOptions } from './cors.js';

describe('buildCorsOptions', () => {
  it('usa los orígenes configurados', () => {
    expect(buildCorsOptions(['http://localhost:5173']).origin).toEqual([
      'http://localhost:5173',
    ]);
  });

  it('expone Content-Disposition para que el panel lea el nombre del PDF', () => {
    expect(buildCorsOptions([]).exposedHeaders).toContain('Content-Disposition');
  });
});
