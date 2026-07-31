// Where a dancer writes to when the app can't help them from inside the app.
//
// Its own module rather than a literal in SuspendedScreen because the moment
// there are two places that show a support address, they will drift — and a
// support address people are given while locked out is the worst one to have
// stale. One export, one place to change it.

export const SUPPORT_EMAIL = 'floormateadmin@gmail.com';
