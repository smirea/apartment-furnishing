// One shared token guards every route, the product media and the UI itself; only the sign-in form is open. The iOS app
// and the laptop runner send it as a bearer, and a browser keeps it in a cookie after signing in once.
const COOKIE = 'apartment_token';
const encoder = new TextEncoder();

function same(a: string, b: string) {
	const [x, y] = [encoder.encode(a), encoder.encode(b)];
	return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
}

function presented(request: Request) {
	const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
	if (bearer) return bearer;
	const cookies = request.headers.get('cookie') ?? '';
	return cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1] ?? null;
}

export const authorized = (request: Request, token: string) => {
	const given = presented(request);
	return given !== null && same(given, token);
};

export async function signIn(request: Request, token: string) {
	const form = await request.formData();
	const given = form.get('token');
	if (typeof given !== 'string' || !same(given.trim(), token)) return loginPage('That token is wrong.', 401);
	return new Response(null, {
		status: 303,
		headers: {
			location: '/',
			'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 400}`,
		},
	});
}

export const loginPage = (message = '', status = 401) =>
	new Response(
		`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Apartment</title>
<style>
	:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
	body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
	form { display: grid; gap: 12px; width: min(360px, 100%); }
	input, button { font: inherit; padding: 10px 12px; border-radius: 8px; border: 1px solid #8888; }
	button { cursor: pointer; }
	p { margin: 0; color: #c33; }
</style>
</head>
<body>
<form method="post" action="/login">
	<h1>Apartment</h1>
	<input name="token" type="password" placeholder="Access token" autocomplete="current-password" required autofocus>
	<button>Sign in</button>
	${message ? `<p>${message}</p>` : ''}
</form>
</body>
</html>`,
		{ status, headers: { 'content-type': 'text/html; charset=utf-8' } },
	);
