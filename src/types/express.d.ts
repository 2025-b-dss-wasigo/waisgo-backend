/**
 * Extension de tipos de Express para el contexto de la app.
 */

import { JwtPayload } from 'src/modules/common/types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {};
