import { z } from "zod";

/**
 * Path params shared across route files (#51). Five route files had each grown
 * their own copy of the café-id schema below; one definition means one answer
 * to "what does a malformed id do?".
 */

/**
 * A uuid path param — Café ids, and the row ids that hang off them (a shift
 * grant, say). A malformed one is simply "not found": the caller learns the
 * same thing either way, and the id never reaches Postgres to fail a cast.
 */
export const uuidParamSchema = z.string().uuid();
