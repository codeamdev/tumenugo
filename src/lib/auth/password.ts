import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, {
    algorithm: 2, // Argon2id
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  })
}

export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    return await argonVerify(hash, password)
  } catch {
    return false
  }
}
