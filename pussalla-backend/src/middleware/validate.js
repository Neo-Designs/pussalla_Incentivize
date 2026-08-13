const { z } = require("zod");

// Express middleware factory: validates req.body against a zod schema.
// On success, replaces req.body with the parsed (and coerced) value;
// on failure, responds 400 with a readable message.
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.issues
        .map((i) => `${i.path.join(".") || "value"}: ${i.message}`)
        .join("; ");
      return res.status(400).json({ error: `Invalid request: ${msg}` });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validateBody, z };
