import { TokenService } from './token.service';

describe('TokenService', () => {
  const accessClaims = {
    sub: 'principal-id',
    realm: 'staff' as const,
    roles: [],
    permissions: [],
    branchScope: [],
    sessionId: 'session-id',
  };

  it('signs access tokens without an expiry claim', () => {
    const jwt = { sign: jest.fn(() => 'access-token') };
    const service = new TokenService(jwt as never);

    expect(service.signAccess(accessClaims)).toBe('access-token');
    expect(jwt.sign).toHaveBeenCalledWith({ ...accessClaims, typ: 'access' });
  });

  it('keeps MFA tokens short-lived', () => {
    const jwt = { sign: jest.fn(() => 'mfa-token') };
    const service = new TokenService(jwt as never);

    expect(service.signMfa('principal-id')).toBe('mfa-token');
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: 'principal-id', typ: 'mfa' },
      { expiresIn: 300 },
    );
  });
});