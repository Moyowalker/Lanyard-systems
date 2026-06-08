import { Injectable } from '@nestjs/common';
import { AvScanStatus } from '@lanyard/contracts';

/**
 * Anti-virus scanner abstraction. This dev implementation flags the standard EICAR
 * test signature as infected (so the infected path is testable) and treats everything
 * else as clean. Production swaps in a real engine (ClamAV/clamd or a cloud malware API)
 * behind this same interface — nothing else changes.
 */
@Injectable()
export class AvScannerService {
  // Backslash-free portion of the standard EICAR test signature — avoids escaping
  // ambiguity across upload layers while remaining the recognised AV test marker.
  private static readonly SIGNATURE = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';

  scan(buffer: Buffer): AvScanStatus {
    const head = buffer.toString('latin1', 0, 1024);
    return head.includes(AvScannerService.SIGNATURE) ? AvScanStatus.INFECTED : AvScanStatus.CLEAN;
  }
}
