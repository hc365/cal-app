// middleware.js
import { get } from "@vercel/edge-config";
import { collectEvents } from "next-collect/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getLocale } from "@calcom/features/auth/lib/getLocale";
import { extendEventData, nextCollectBasicSettings } from "@calcom/lib/telemetry";

import { csp } from "@lib/csp";

import { abTestMiddlewareFactory } from "./abTest/middlewareFactory";

// Função para parsear ALLOWED_HOSTNAMES
const parseAllowedHostnames = () => {
  const allowedHostnamesEnv = process.env.ALLOWED_HOSTNAMES || "";
  // Remove aspas e divide por vírgula
  return allowedHostnamesEnv
    .split(",")
    .map((host) => host.trim().replace(/^"|"$/g, ""))
    .filter((host) => host.length > 0);
};

// Obter a lista de hostnames permitidos
const ALLOWED_HOSTNAMES = parseAllowedHostnames();

// Função para verificar se a origem é permitida
const isOriginAllowed = (origin) => {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return ALLOWED_HOSTNAMES.includes(url.hostname) || ALLOWED_HOSTNAMES.includes(url.host);
  } catch (e) {
    return false;
  }
};

const safeGet = async (key) => {
  try {
    return await get(key);
  } catch (error) {
    // Não falhe se a variável de ambiente EDGE_CONFIG estiver faltando
    return undefined;
  }
};

const middleware = async (req) => {
  const url = req.nextUrl;
  const requestHeaders = new Headers(req.headers);

  requestHeaders.set("x-url", req.url);

  // Lógica de CORS
  const origin = req.headers.get("origin");

  if (origin && isOriginAllowed(origin)) {
    requestHeaders.set("Access-Control-Allow-Origin", origin);
    requestHeaders.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    requestHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (!url.pathname.startsWith("/api")) {
    // Verificação de modo de manutenção
    const isInMaintenanceMode = await safeGet("isInMaintenanceMode");
    if (isInMaintenanceMode) {
      req.nextUrl.pathname = `/maintenance`;
      return NextResponse.rewrite(req.nextUrl);
    }
  }

  const res = routingForms.handle(url);

  const { nonce } = csp(req, res ?? null);

  if (!process.env.CSP_POLICY) {
    req.headers.set("x-csp", "not-opted-in");
  } else if (!req.headers.get("x-csp")) {
    // Se x-csp não estiver definido por gSSP, então é initialPropsOnly
    req.headers.set("x-csp", "initialPropsOnly");
  } else {
    req.headers.set("x-csp", nonce ?? "");
  }

  if (res) {
    return res;
  }

  if (url.pathname.startsWith("/api/trpc/")) {
    requestHeaders.set("x-cal-timezone", req.headers.get("x-vercel-ip-timezone") ?? "");
  }

  if (url.pathname.startsWith("/api/auth/signup")) {
    const isSignupDisabled = await safeGet("isSignupDisabled");
    if (isSignupDisabled) {
      return NextResponse.json({ error: "Signup is disabled" }, { status: 503 });
    }
  }

  if (url.pathname.startsWith("/auth/login") || url.pathname.startsWith("/login")) {
    // Use este cabeçalho para realmente impor CSP, caso contrário, está rodando em modo Report Only em todas as páginas.
    requestHeaders.set("x-csp-enforce", "true");
  }

  if (url.pathname.startsWith("/future/apps/installed")) {
    const returnTo = req.cookies.get("return-to")?.value;
    if (returnTo !== undefined) {
      requestHeaders.set("Set-Cookie", "return-to=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT");

      let validPathname = returnTo;

      try {
        validPathname = new URL(returnTo).pathname;
      } catch (e) {}

      const nextUrl = url.clone();
      nextUrl.pathname = validPathname;
      return NextResponse.redirect(nextUrl, { headers: requestHeaders });
    }
  }

  if (url.pathname.startsWith("/future/auth/logout")) {
    cookies().set("next-auth.session-token", "", {
      path: "/",
      expires: new Date(0),
    });
  }

  requestHeaders.set("x-pathname", url.pathname);

  const locale = await getLocale(req);

  requestHeaders.set("x-locale", locale);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
};

const routingForms = {
  handle: (url) => {
    // Não 404 links antigos de routing_forms
    if (url.pathname.startsWith("/apps/routing_forms")) {
      url.pathname = url.pathname.replace(/^\/apps\/routing_forms($|\/)/, "/apps/routing-forms/");
      return NextResponse.rewrite(url);
    }
  },
};

export const config = {
  // Next.js não suporta operador spread no matcher de configuração, então, devemos listar todos os caminhos explicitamente aqui.
  // https://github.com/vercel/next.js/discussions/42458
  matcher: [
    "/:path*/embed",
    "/api/auth/signup",
    "/api/trpc/:path*",
    "/login",
    "/auth/login",
    "/future/auth/login",
    /**
     * Caminhos necessários para routingForms.handle
     */
    "/apps/routing_forms/:path*",

    "/event-types",
    "/future/event-types/",
    "/settings/admin/:path*",
    "/future/settings/admin/:path*",
    "/apps/installed/:category/",
    "/future/apps/installed/:category/",
    "/apps/:slug/",
    "/future/apps/:slug/",
    "/apps/:slug/setup/",
    "/future/apps/:slug/setup/",
    "/apps/categories/",
    "/future/apps/categories/",
    "/apps/categories/:category/",
    "/future/apps/categories/:category/",
    "/workflows/:path*",
    "/future/workflows/:path*",
    "/settings/teams/:path*",
    "/future/settings/teams/:path*",
    "/getting-started/:step/",
    "/future/getting-started/:step/",
    "/apps",
    "/future/apps",
    "/bookings/:status/",
    "/future/bookings/:status/",
    "/video/:path*",
    "/future/video/:path*",
    "/teams",
    "/future/teams/",
  ],
};

export default collectEvents({
  middleware: abTestMiddlewareFactory(middleware),
  ...nextCollectBasicSettings,
  cookieName: "__clnds",
  extend: extendEventData,
});
