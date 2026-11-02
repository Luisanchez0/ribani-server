import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class AuthAttemptsService {
  private readonly buckets = new Map<
    string,
    { count: number; until: number }
  >();

  consume(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (this.buckets.size >= 10_000) {
        for (const [entry, value] of this.buckets) {
          if (value.until <= now) this.buckets.delete(entry);
        }
        if (this.buckets.size >= 10_000) {
          throw new ServiceUnavailableException('Inténtalo más tarde.');
        }
      }
      bucket = { count: 0, until: now + windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= limit) {
      throw new HttpException(
        'Demasiados intentos. Inténtalo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    bucket.count++;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}
