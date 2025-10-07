// Module augmentation to add project-specific bindings to the `env` export
// from the virtual module "cloudflare:workers" so that `env.AUTH0_...` has
// proper type inference in source files.

declare module "cloudflare:workers" {
  // Re-declare `env` with the widened project Env interface (merged from `worker-configuration.d.ts`).
  // The base module already provides `env`; this augmentation only refines its type.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const env: Env;
  export { env };
}
