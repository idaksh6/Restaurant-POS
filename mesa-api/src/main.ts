import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { NextFunction, Request, Response } from 'express'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  // Company logos are sent as data URLs; Nest's default 100kb JSON limit
  // rejects that and the browser reports it as "Failed to fetch".
  app.useBodyParser('json', { limit: '10mb' })
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true })
  // CyberPanel OpenLiteSpeed reverse-proxy duplicates Access-Control-Allow-Origin
  // when Nest also sets it. On the server set CORS_IN_APP=0 and put the CORS
  // headers on the LiteSpeed vhost (extraHeaders). Nest must still answer
  // OPTIONS with 204 or the browser rejects the preflight (404 is not OK).
  if (process.env.CORS_IN_APP === '0') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'OPTIONS') {
        res.status(204).end()
        return
      }
      next()
    })
  } else {
    app.enableCors({ origin: true })
  }
  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? '0.0.0.0'
  await app.listen(port, host)
  console.log(`mesa-api listening on http://${host}:${port}`)
}

bootstrap()
