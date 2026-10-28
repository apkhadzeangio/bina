// GET /api/render/config — what the render service allows right now (no secrets).
import { handleConfig } from '../../../server/render/handler.js';

export const onRequestGet = (context) => handleConfig(context.request, context.env);
