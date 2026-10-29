/**
 * Makes API output consistent: `_id` becomes `id`, `__v` is dropped and secrets never
 * leave the server. Subdocuments without an `_id` are left alone.
 */
// The schema type has many generics; `any` keeps this helper reusable across models.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanJson(schema: any): void {
  schema.set('toJSON', {
    versionKey: false,
    transform: (_doc: unknown, ret: Record<string, unknown>) => {
      if (ret._id !== undefined) {
        ret.id = String(ret._id);
        delete ret._id;
      }
      delete ret.passwordHash;
      return ret;
    },
  });
}
