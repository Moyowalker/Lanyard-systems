import { AvScanStatus } from '@lanyard/contracts';

import { AvScannerService } from './av-scanner.service';

describe('AV scanner', () => {
  const scanner = new AvScannerService();

  it('scans clean content as CLEAN', () => {
    expect(scanner.scan(Buffer.from('a normal prescription image'))).toBe(AvScanStatus.CLEAN);
  });

  it('flags the EICAR signature as INFECTED', () => {
    expect(scanner.scan(Buffer.from('...EICAR-STANDARD-ANTIVIRUS-TEST-FILE... x'))).toBe(
      AvScanStatus.INFECTED,
    );
  });

  it('treats an empty buffer as CLEAN', () => {
    expect(scanner.scan(Buffer.alloc(0))).toBe(AvScanStatus.CLEAN);
  });
});
