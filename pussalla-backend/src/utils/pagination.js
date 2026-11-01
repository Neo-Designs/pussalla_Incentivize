// Parses pagination query params into a normalized { page, limit, offset }.
// Defaults: page 1, limit 50. Max limit 2000 (caps large/scraped requests;
// raised from 200 so a single-plant roster of a few hundred employees can
// still be fetched in one page by the admin UI).
function parsePagination(req) {
  let page = parseInt(req.query.page, 10);
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  if (limit > 2000) limit = 2000;
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = { parsePagination };
