// Bun.serve-style route tables on URLPattern, so the API reads as one map of path to handler.
export type RouteRequest = Request & { params: Record<string, string> };
type Handler = (request: RouteRequest) => Response | Promise<Response>;
type Method = 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE';
export type Routes = Record<string, Handler | Partial<Record<Method, Handler>>>;

export function router(routes: Routes) {
	const compiled = Object.entries(routes).map(([path, handler]) => ({
		pattern: new URLPattern({ pathname: path }),
		handler,
	}));
	return async (request: Request): Promise<Response | null> => {
		for (const { pattern, handler } of compiled) {
			const match = pattern.exec(request.url);
			if (!match) continue;
			const method = typeof handler === 'function' ? handler : handler[request.method as Method];
			if (!method) return Response.json({ error: `${request.method} not allowed` }, { status: 405 });
			const params = Object.fromEntries(
				Object.entries(match.pathname.groups).map(([k, v]) => [k, decodeURIComponent(v ?? '')]),
			);
			return method(Object.assign(request, { params }));
		}
		return null;
	};
}
