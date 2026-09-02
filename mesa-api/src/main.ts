import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  // Company logos are sent as data URLs; Nest's default 100kb JSON limit
  // rejects that and the browser reports it as "Failed to fetch".
  app.useBodyParser('json', { limit: '10mb' })
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true })
  // LiteSpeed/CyberPanel OLS duplicates Access-Control-Allow-Origin when both
  // the reverse proxy and Nest send it. Set CORS_IN_APP=0 on the server.
  if (process.env.CORS_IN_APP !== '0') {
    app.enableCors({ origin: true })
  }
  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? '0.0.0.0'
  await app.listen(port, host)
  console.log(`mesa-api listening on http://${host}:${port}`)
}

bootstrap()
