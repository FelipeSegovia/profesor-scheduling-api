/**
 * Enlaces de los correos hacia `public-parents-scheduling-web/` (spec 006).
 * Las rutas son las de su `src/App.tsx`. `baseUrl` es `PUBLIC_WEB_URL`; se
 * recibe por parámetro para que esto siga siendo puro.
 *
 * No se usa `new URL(path, base)`: con una base con subruta (`https://x.cl/agenda`)
 * descartaría `/agenda`.
 */
export function confirmUrl(baseUrl: string, confirmToken: string): string {
  return join(baseUrl, `/sesion/${encodeURIComponent(confirmToken)}/confirmar`);
}

export function cancelUrl(baseUrl: string, cancelToken: string): string {
  return join(baseUrl, `/sesion/${encodeURIComponent(cancelToken)}/cancelar`);
}

export function resetPasswordUrl(baseUrl: string, token: string): string {
  return join(baseUrl, `/cuenta/restablecer/${encodeURIComponent(token)}`);
}

function join(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path;
}
