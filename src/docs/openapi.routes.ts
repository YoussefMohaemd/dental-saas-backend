import { Router } from 'express';

import { createOpenApiDocument } from './openapi';

const openApiRouter = Router();
const openApiDocument = createOpenApiDocument();

openApiRouter.get('/docs/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});

openApiRouter.get('/docs', (_req, res) => {
  res.type('html').send(buildSwaggerUiHtml('/api/docs/openapi.json'));
});

openApiRouter.get('/docs/', (_req, res) => {
  res.type('html').send(buildSwaggerUiHtml('/api/docs/openapi.json'));
});

function buildSwaggerUiHtml(specUrl: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dental SaaS API Docs</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *::before, *::after { box-sizing: inherit; }
      body { margin: 0; background: #fafafa; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: '${specUrl}',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'StandaloneLayout'
        });
      };
    </script>
  </body>
</html>`;
}

export { openApiRouter };
