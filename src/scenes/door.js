export function mount(el, ctx, params) {
  ctx.router.go('hub', params).catch((err) => console.error('The main menu could not open', err));
  return () => {};
}
