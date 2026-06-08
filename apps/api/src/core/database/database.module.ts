import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

/**
 * Establishes the single MongoDB connection (replica set) for the whole app.
 * Transactions used by order/payment/inventory flows require a replica set —
 * the local docker-compose runs Mongo as a single-node RS for this reason.
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        autoIndex: config.get<string>('NODE_ENV') !== 'production', // build indexes in dev; manage via migrations in prod
        retryWrites: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
