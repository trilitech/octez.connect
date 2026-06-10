import {
  getAddressFromPublicKey,
  isValidAddress,
  prefixPublicKey,
  isPublicKeySC,
  toHex,
  getHexHash,
  getKeypairFromSeed,
  encryptCryptoboxPayload,
  decryptCryptoboxPayload,
  sealCryptobox,
  openCryptobox,
  recipientString,
  signMessage,
  encodePoeChallengePayload
} from '../../src/utils/crypto'

const TZ5_ADDRESS_AUTHORITATIVE = 'tz5fxSJrMeVsmEAVDencuUcpgRe3Kw7CwPFe'
const TZ5_ADDRESS_DERIVED = 'tz5dBkjzicFLcEp5HLwkpqbVv1tE9EVaxs6e'
const MDPK_PUBLIC_KEY =
  'mdpk2A7JWfJSqYhEc2qbcPptJhHLdwzciT2TvnTxsYmeRWf5qUUZBM1Jj5qoTPz4S9AGDS7xRmnUFgbqofm62sS1h4CNfps2dwoVgY6puEcxse8UeCii5C62z4FWwoNTonF9n8bTz3s5pXap4aQSbLsp4LU3zeq5UPT4iqmHooQbHb48QwHJB2GZogFCkUJCE8jFaQpaiYyzpVseZVrD5gAA1MoVrGQB7yJPKXaBr9fNV64tYirXF1ZCVCrDsB5XK8gFpT7DtHStpt8i8CbTg58a6qs3NKHLhsDJujNrPv4BD7cV6nkdbhMyS8U82NdTETYk3xtbhm7RPVqmtJKE8FDd9iVPJMFAQ8RRvJj3mtFazroUAC4436JbPzGLcPmGWYYLSjMKBDsmydE2qqf7CsHyxiet4LmFpCZZftUCURzuuHsDCs5Kw7VPR4jE65awhD7wndEUFE5dpdH5uXBWz3Da6Es6ijEnbMPsKpN7vrtVsURvQBzqKPmuVkdd4RdLoVXVxXEk87xmRM6NgAkiN9BBKw9BCAro1ro4pc7zDSVgggcajHLF2hvE95mN7bGV6NvJRioMKhcecoVJfhDZ61JpcqjqzRouBn7F3URjGyXRsv1WhqkhDLHtA6jfeevERtrAv2VZQdXLQaWGUjX2W7wcJY1CzHh6nSYiRdotPDRHnQu2HvKuSguARuQ1UZkx6Ziv3q5fWDJ6Jtaf7ShJMXTJhcjYLFUg5QpZX5CWAkKvMVPYibuiKeGi4KN8i7JAiWXtCqPA7Ei2Afh9uiPaHPF5Z9Muptg8zj25mqwSmY4DcDm7G8B28vk2eRwgr1WPYfxcS2Q9nGioM5gw8rCeH5zAiTf9q5MZQ5ztj3pd9Q25ev8YNb3xNkPb9ic5EkspABppy7aBgYHAxc8ixxe2G5iC774jkWnF3NGKMRrTdLG3UBtfLdNUY1bXFFBvf4Yg8i66kBTRvyRSdSoxFjgrZfNiG16XAWnSqMBGHsS56NGk1736BzKw1EAhVF8GX4P2mUdFj2h1YFdcAXubv4ojsWPh8LRgRKQ2R6iw58dSWyDN48PMQT91kQZtUwX4ZNwAjSEow5yoS2NSraVLFcrt9pyE1hjKgfnSb9d6H9zKXVcUuB7bRkeXaM1qzygnbskpzJ221tgB4EgT7y9nVew2koVtT53Sr7kFki3E4fG9rvuVukwHH73kBNbJY1U25KQHtEJcAjrpsg5A8GrBS7FTxKfBH47FfqnzfJCgHag4AoaXWSm7BnzFkJWPrZ6eBVDy3NMzhQcfQNjVTUaxTH21pWGE1Jhtq9rgDufy2EezLt7MXE2YeNGBTBh3eBKGyGJZ7M86PcMFeu96kj3F3kAqmYc3umz2QsMaqmAoKU2y3BrCsBYxLoC951n5DyqBMFh7mat6PhkEZv4XLeHXxbzaWvwWMT1H8gv2wejnWNZV7kiKVreH4AjUZtmN3KRpbFUdfmyKZMJGsvgrdt3L3xXDpjnUR52W9MX72YYNvjYwJC7BpbE9Xho4MEEFcgmPrTwbg5g4dV34NqueFEqJj2EnaMKFHMrENRKMeXKt3qt7ci6bD5DJpJLmhDpCmxRF86j7BqnC27ooE9qzBVbFhFmrTk7GxJ7ov2K9Y4zuCYrUiWNexqCm971Vgpv8wuaSAMiPSwCy3VtrACfjNrJhA2PuA9xmLEj4HMTgEDRQwjUUUuZT3unZQn8wrEW8oiXN9z5P7JWt9aZNyXNLSykBTtshKkrs1HDAPKzzKpHk4pJvmU99h8fz41Ej9SsPiSyMY9tTN3shfEqEL9'

describe('getAddressFromPublicKey', () => {
  describe('edpk (tz1)', () => {
    it('converts edpk public key to tz1 address', async () => {
      const publicKey = 'edpkuSLWfVU1Vq7Jg9FucPyKmma6otcMHac9zG4oU1KMHSTBpJuGQ2'
      const address = await getAddressFromPublicKey(publicKey)
      expect(address).toBe('tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV')
      expect(isValidAddress(address)).toBe(true)
    })
  })

  describe('sppk (tz2)', () => {
    it('converts sppk public key to tz2 address', async () => {
      const publicKey = 'sppk7czKu6So3zDWjhBPBv9wgCrBAfbEFoKYzEaKUsjhNr5Ug6E4Sn1'
      const address = await getAddressFromPublicKey(publicKey)
      expect(address).toBe('tz2Gsf1Q857wUzkNGzHsJNC98z881UutMwjg')
      expect(isValidAddress(address)).toBe(true)
    })
  })

  describe('p2pk (tz3)', () => {
    it('converts p2pk public key to tz3 address', async () => {
      const publicKey = 'p2pk67BANWUUX2fod9EQbv8ev7GGLpb4UXvLHEVVMiHBSWPHgyzf1tv'
      const address = await getAddressFromPublicKey(publicKey)
      expect(address).toBe('tz3daYfTrShLBfH24hv2kGwXD5y2bApH83RC')
      expect(isValidAddress(address)).toBe(true)
    })
  })

  describe('BLpk (tz4)', () => {
    it('converts BLpk public key to tz4 address', async () => {
      // This is the failing case from the bug report
      const publicKey = 'BLpk1zPXKmbZebsByVGqLej8k5ffsUmhfAKLR8xGphdRn7bptb61HdcBQ1gQ7NcrhAYoff1meYY4'
      const address = await getAddressFromPublicKey(publicKey)
      expect(address.startsWith('tz4')).toBe(true)
      expect(isValidAddress(address)).toBe(true)
    })

  })

  describe('mdpk (tz5 / ML-DSA-44)', () => {
    it('derives the canonical tz5 address from an mdpk public key (TC-a / FR-002)', async () => {
      const address = await getAddressFromPublicKey(MDPK_PUBLIC_KEY)
      expect(address).toBe(TZ5_ADDRESS_DERIVED)
      expect(address.startsWith('tz5')).toBe(true)
      expect(isValidAddress(address)).toBe(true)
    })

    it('handles the 1802-char ML-DSA-44 key without truncation (FR-004)', async () => {
      // The key is far larger than legacy keys (54-76 chars); no fixed-length assumption may break it.
      expect(MDPK_PUBLIC_KEY.length).toBe(1802)
      await expect(getAddressFromPublicKey(MDPK_PUBLIC_KEY)).resolves.toMatch(/^tz5/)
    })

    it('rejects an mdpk-prefixed key of the wrong length (C4 edge / FR-004)', async () => {
      await expect(getAddressFromPublicKey('mdpk' + 'x'.repeat(50))).rejects.toThrow(
        'invalid publicKey'
      )
    })

    it('derives identically regardless of network — flag-agnostic (FR-011)', async () => {
      // getAddressFromPublicKey takes no network/flag argument; the result is invariant
      // to tz5_account_enable state. Determinism across calls encodes that invariant.
      const a = await getAddressFromPublicKey(MDPK_PUBLIC_KEY)
      const b = await getAddressFromPublicKey(MDPK_PUBLIC_KEY)
      expect(a).toBe(b)
      expect(a).toBe(TZ5_ADDRESS_DERIVED)
    })
  })

  describe('raw hex public key', () => {
    it('converts 64-char hex public key to tz1 address', async () => {
      const hexKey = 'e8466d57c1d54e5a3f4ae33988eb5cbb5c7bb2fa30d0f347ccd30f53ac527a97'
      const address = await getAddressFromPublicKey(hexKey)
      expect(address.startsWith('tz1')).toBe(true)
      expect(isValidAddress(address)).toBe(true)
    })
  })

  describe('invalid keys', () => {
    it('throws for invalid public key', async () => {
      await expect(getAddressFromPublicKey('invalid')).rejects.toThrow('invalid publicKey')
    })
  })
})

describe('isPublicKeySC', () => {
  it('returns true for edpk keys', () => {
    expect(isPublicKeySC('edpkuSLWfVU1Vq7Jg9FucPyKmma6otcMHac9zG4oU1KMHSTBpJuGQ2')).toBe(true)
  })

  it('returns true for BLpk keys', () => {
    expect(isPublicKeySC('BLpk1zPXKmbZebsByVGqLej8k5ffsUmhfAKLR8xGphdRn7bptb61HdcBQ1gQ7NcrhAYoff1meYY4')).toBe(true)
  })

  it('returns true for mdpk (ML-DSA-44) keys (TC-c / FR-003)', () => {
    expect(isPublicKeySC(MDPK_PUBLIC_KEY)).toBe(true)
  })

  it('returns false for invalid keys', () => {
    expect(isPublicKeySC('invalid')).toBe(false)
    expect(isPublicKeySC('')).toBe(false)
  })
})

describe('prefixPublicKey', () => {
  it('prefixes 64-char hex key with edpk', () => {
    const hexKey = 'e8466d57c1d54e5a3f4ae33988eb5cbb5c7bb2fa30d0f347ccd30f53ac527a97'
    const prefixed = prefixPublicKey(hexKey)
    expect(prefixed.startsWith('edpk')).toBe(true)
    expect(prefixed.length).toBe(54)
  })

  it('returns already-prefixed keys unchanged', () => {
    const edpk = 'edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Ber9eA26hQv'
    expect(prefixPublicKey(edpk)).toBe(edpk)
  })
})

describe('toHex', () => {
  it('converts string to hex', () => {
    expect(toHex('hello')).toBe('68656c6c6f')
  })

  it('converts Buffer to hex', () => {
    expect(toHex(Buffer.from([0x01, 0x02, 0x03]))).toBe('010203')
  })

  it('converts Uint8Array to hex', () => {
    expect(toHex(new Uint8Array([255, 0, 128]))).toBe('ff0080')
  })
})

describe('getHexHash', () => {
  it('hashes a string and returns hex', async () => {
    const hash = await getHexHash('test')
    expect(hash).toHaveLength(64) // 32 bytes = 64 hex chars
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('hashes a Buffer and returns hex', async () => {
    const hash = await getHexHash(Buffer.from('test'))
    expect(hash).toHaveLength(64)
  })

})

describe('recipientString', () => {
  it('formats Matrix recipient string correctly', () => {
    expect(recipientString('abc123', 'matrix.org')).toBe('@abc123:matrix.org')
  })
})


describe('getKeypairFromSeed', () => {
  it('generates a keypair from seed', async () => {
    const keypair = await getKeypairFromSeed('test seed')
    expect(keypair.publicKey).toBeInstanceOf(Uint8Array)
    expect(keypair.secretKey).toBeInstanceOf(Uint8Array)
    expect(keypair.publicKey).toHaveLength(32)
    expect(keypair.secretKey).toHaveLength(64)
  })

})

describe('symmetric encryption', () => {
  it('encrypts and decrypts a message with shared key', async () => {
    const keypair = await getKeypairFromSeed('test')
    const sharedKey = keypair.publicKey // Using public key as shared key for simplicity

    const message = 'Hello, World!'
    const encrypted = await encryptCryptoboxPayload(message, sharedKey)

    expect(encrypted).toMatch(/^[0-9a-f]+$/)
    expect(encrypted.length).toBeGreaterThan(message.length * 2) // Includes nonce + mac

    const decrypted = await decryptCryptoboxPayload(
      Buffer.from(encrypted, 'hex'),
      sharedKey
    )
    expect(decrypted).toBe(message)
  })

  it('throws on decryption with wrong key', async () => {
    const keypair1 = await getKeypairFromSeed('key1')
    const keypair2 = await getKeypairFromSeed('key2')

    const message = 'secret message'
    const encrypted = await encryptCryptoboxPayload(message, keypair1.publicKey)

    await expect(
      decryptCryptoboxPayload(Buffer.from(encrypted, 'hex'), keypair2.publicKey)
    ).rejects.toThrow('Decryption failed')
  })
})

describe('asymmetric encryption', () => {
  it('encrypts with public key and decrypts with private key', async () => {
    const keypair = await getKeypairFromSeed('asymmetric test')

    const message = 'Secret message for asymmetric encryption'
    const encrypted = await sealCryptobox(message, keypair.publicKey)

    expect(encrypted).toMatch(/^[0-9a-f]+$/)

    const decrypted = await openCryptobox(
      Buffer.from(encrypted, 'hex'),
      keypair.publicKey,
      keypair.secretKey
    )
    expect(decrypted).toBe(message)
  })

  it('works with Buffer payload', async () => {
    const keypair = await getKeypairFromSeed('buffer test')
    const message = Buffer.from('Buffer message')

    const encrypted = await sealCryptobox(message, keypair.publicKey)
    const decrypted = await openCryptobox(
      Buffer.from(encrypted, 'hex'),
      keypair.publicKey,
      keypair.secretKey
    )
    expect(decrypted).toBe('Buffer message')
  })

  it('throws on decryption with wrong private key', async () => {
    const keypair1 = await getKeypairFromSeed('sender')
    const keypair2 = await getKeypairFromSeed('wrong receiver')

    const encrypted = await sealCryptobox('secret', keypair1.publicKey)

    await expect(
      openCryptobox(
        Buffer.from(encrypted, 'hex'),
        keypair2.publicKey,
        keypair2.secretKey
      )
    ).rejects.toThrow('Decryption failed')
  })

})

describe('signMessage', () => {
  it('signs a message and returns edsig signature', async () => {
    const keypair = await getKeypairFromSeed('signing test')

    const signature = await signMessage('message to sign', {
      secretKey: Buffer.from(keypair.secretKey)
    })

    expect(signature.startsWith('edsig')).toBe(true)
    expect(signature.length).toBeGreaterThan(90)
  })

  it('handles hex input with 0x prefix', async () => {
    const keypair = await getKeypairFromSeed('hex signing')

    const signature = await signMessage('0x1234abcd', {
      secretKey: Buffer.from(keypair.secretKey)
    })

    expect(signature.startsWith('edsig')).toBe(true)
  })

  it('handles odd-length strings', async () => {
    const keypair = await getKeypairFromSeed('odd length')

    const signature = await signMessage('abc', {
      secretKey: Buffer.from(keypair.secretKey)
    })

    expect(signature.startsWith('edsig')).toBe(true)
  })
})

describe('isValidAddress', () => {
  it('validates tz1 addresses', () => {
    expect(isValidAddress('tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV')).toBe(true)
  })

  it('validates tz2 addresses', () => {
    expect(isValidAddress('tz2Gsf1Q857wUzkNGzHsJNC98z881UutMwjg')).toBe(true)
  })

  it('validates tz3 addresses', () => {
    expect(isValidAddress('tz3daYfTrShLBfH24hv2kGwXD5y2bApH83RC')).toBe(true)
  })

  it('validates tz4 addresses', () => {
    expect(isValidAddress('tz4HVR6aty9KwsQFHh81C1G7gBdhxT8kuytm')).toBe(true)
  })

  it('validates tz5 addresses (TC-b / FR-001)', () => {
    // Authoritative tz5 address from octez proto_025_PsUshuai protocol tests
    expect(isValidAddress(TZ5_ADDRESS_AUTHORITATIVE)).toBe(true)
    expect(isValidAddress(TZ5_ADDRESS_DERIVED)).toBe(true)
  })

  it('validates KT1 contract addresses', () => {
    expect(isValidAddress('KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn')).toBe(true)
  })

  it('rejects addresses with wrong prefix', () => {
    expect(isValidAddress('tz5invalid')).toBe(false)
    expect(isValidAddress('xx1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV')).toBe(false)
  })

  it('rejects addresses with invalid checksum', () => {
    // Modified last character to break checksum
    expect(isValidAddress('tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYX')).toBe(false)
  })

  it('rejects empty and invalid strings', () => {
    expect(isValidAddress('')).toBe(false)
    expect(isValidAddress('invalid')).toBe(false)
  })
})

describe('encodePoeChallengePayload', () => {
  it('encodes a PoE challenge payload', () => {
    const encoded = encodePoeChallengePayload('test challenge')
    expect(encoded).toBeTruthy()
    expect(typeof encoded).toBe('string')
  })

})
