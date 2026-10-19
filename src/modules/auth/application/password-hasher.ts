import argon2 from 'argon2';

export class PasswordHasher {
  public async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  public async verify(hash: string, candidatePassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, candidatePassword);
    } catch {
      return false;
    }
  }
}
