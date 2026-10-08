import { NextResponse, type NextRequest } from "next/server";

// Comprobación optimista: sin cookie de sesión no se entra al dashboard.
// La verificación real (firma del JWT + usuario existente) ocurre en lib/auth.ts.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("lazu_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
