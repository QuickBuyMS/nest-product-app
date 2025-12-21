import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { lastValueFrom } from 'rxjs';
import { Inject, Headers } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class TokenMiddleware implements NestMiddleware {
  constructor(
    @Inject('AUTH_MICROSERVICE') private readonly authClient: ClientProxy,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    let token_raw = req.headers['authorization']; // or req.headers.authorization
    if (!token_raw) return { error: 'No token provided' };
    let token = token_raw.toString().replace(/^Bearer\s+/i, '');
    // console.log('Received token', token);
    // Ask auth microservice to verify token
    const verify$ = this.authClient.send({ cmd: 'verify_token' }, { token });
    const result = await lastValueFrom(verify$);
    if (!result.valid)
      return res
        .status(401)
        .json({ error: 'Unauthorized', details: result.error });
    next();
  }
}
