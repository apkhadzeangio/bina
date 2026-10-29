// POST /api/render — generate an AI interior visualization (see server/render/handler.js).
import { handleRender } from '../../../server/render/handler.js';

export const onRequestPost = (context) => handleRender(context.request, context.env, context);
