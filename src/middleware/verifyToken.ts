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
    // const token = req.headers['authorization']; // or req.headers.authorization
    // if (!authHeader) return { error: 'No token provided' };
    // const token = authHeader.replace('Bearer ', '');
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjI3L...';

    // Ask auth microservice to verify token
    const verify$ = this.authClient.send({ cmd: 'verify_token' }, { token });
    const result = await lastValueFrom(verify$);
    if (!result.valid) return res.status(401).json({ error: 'Unauthorized', details: result.error });
    next();
  }
}
