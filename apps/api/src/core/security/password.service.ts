import { Injectable } from '@nestjs/common';
import { hash, verify, Algorithm } from '@node-rs/argon2';

/**
 * Argon2id password hashing (doc 07). Uses @node-rs/argon2 (prebuilt native binary,
 * no node-gyp) so it installs cleanly across platforms incl. Windows.
 */
@Injectable()
export class PasswordService {
  private readonly options = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456, // ~19 MB (OWASP minimum)
    timeCost: 2,
    parallelism: 1,
  };

  hash(plain: string): Promise<string> {
    return hash(plain, this.options);
  }

  async verify(storedHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(storedHash, plain);
    } catch {
      // Malformed hash (e.g. seed placeholder) → treat as non-match, never throw.
      return false;
    }
  }
}
