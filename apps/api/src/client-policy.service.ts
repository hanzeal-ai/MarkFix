import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export const compareVersions = (left: string, right: string): number => {
  const leftMatch = versionPattern.exec(left);
  const rightMatch = versionPattern.exec(right);
  if (!leftMatch || !rightMatch)
    throw new Error('Expected semantic version in major.minor.patch form');
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(leftMatch[index]) - Number(rightMatch[index]);
    if (difference !== 0) return Math.sign(difference);
  }
  const leftPrerelease = leftMatch[4];
  const rightPrerelease = rightMatch[4];
  if (!leftPrerelease && !rightPrerelease) return 0;
  if (!leftPrerelease) return 1;
  if (!rightPrerelease) return -1;
  const leftIdentifiers = leftPrerelease.split('.');
  const rightIdentifiers = rightPrerelease.split('.');
  for (
    let index = 0;
    index < Math.max(leftIdentifiers.length, rightIdentifiers.length);
    index += 1
  ) {
    const leftIdentifier = leftIdentifiers[index];
    const rightIdentifier = rightIdentifiers[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumber = /^\d+$/.test(leftIdentifier) ? Number(leftIdentifier) : undefined;
    const rightNumber = /^\d+$/.test(rightIdentifier) ? Number(rightIdentifier) : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined)
      return Math.sign(leftNumber - rightNumber);
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return leftIdentifier.localeCompare(rightIdentifier);
  }
  return 0;
};

@Injectable()
export class ClientPolicyService {
  getWindowsUpdate() {
    // The existing policy remains the only authority for the offered version.
    const policy = this.getPolicy('0.0.0', 'win32', 'x64');
    const sha512 = process.env.MARKFIX_DESKTOP_WINDOWS_X64_UPDATE_SHA512 ?? '';
    const size = Number(process.env.MARKFIX_DESKTOP_WINDOWS_X64_UPDATE_SIZE);
    if (
      !policy.downloadUrl ||
      Buffer.from(sha512, 'base64').length !== 64 ||
      Buffer.from(sha512, 'base64').toString('base64') !== sha512 ||
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > 2 * 1024 * 1024 * 1024
    ) {
      throw new ServiceUnavailableException('Verified Windows update package is not published');
    }
    const url = new URL(policy.downloadUrl);
    if (
      url.search ||
      !url.pathname.endsWith(`/MarkFix-${policy.recommendedVersion}-windows-x64-setup.exe`)
    )
      throw new ServiceUnavailableException('Windows update package does not match version policy');
    return {
      version: policy.recommendedVersion,
      files: [{ url: url.href, sha512, size }],
    };
  }

  getUpdate(version: string | undefined, platform: string | undefined, arch: string | undefined) {
    if (platform !== 'darwin' || (arch !== 'arm64' && arch !== 'x64'))
      throw new BadRequestException('Unsupported update platform or architecture');
    const policy = this.getPolicy(version);
    if (compareVersions(policy.currentVersion, policy.recommendedVersion) >= 0) return undefined;
    if (process.env.MARKFIX_DESKTOP_MAC_DISTRIBUTION === 'trial')
      throw new ServiceUnavailableException('Trial packages require manual installation');
    const downloadUrl = process.env[`MARKFIX_DESKTOP_MAC_${arch.toUpperCase()}_UPDATE_URL`];
    if (!downloadUrl)
      throw new ServiceUnavailableException('Desktop update package is not published');
    let url: URL;
    try {
      url = new URL(downloadUrl);
    } catch {
      throw new ServiceUnavailableException('Invalid desktop update package URL');
    }
    if (url.protocol !== 'https:' || url.username || url.password || !url.pathname.endsWith('.zip'))
      throw new ServiceUnavailableException('Desktop updates require an HTTPS ZIP package');
    return { url: url.href, name: policy.recommendedVersion };
  }

  getPolicy(currentVersion: string | undefined, platform = 'darwin', arch = 'arm64') {
    if (!currentVersion || !versionPattern.test(currentVersion)) {
      throw new ConflictException('A valid desktop version is required');
    }
    const windows = platform === 'win32';
    const minimumVersion =
      process.env[
        windows ? 'MARKFIX_WINDOWS_MINIMUM_DESKTOP_VERSION' : 'MARKFIX_MINIMUM_DESKTOP_VERSION'
      ] ?? '0.1.0';
    const recommendedVersion =
      process.env[
        windows
          ? 'MARKFIX_WINDOWS_RECOMMENDED_DESKTOP_VERSION'
          : 'MARKFIX_RECOMMENDED_DESKTOP_VERSION'
      ] ?? minimumVersion;
    const downloadUrl =
      windows && arch === 'x64'
        ? process.env.MARKFIX_DESKTOP_WINDOWS_X64_DOWNLOAD_URL
        : platform === 'darwin' && arch === 'arm64'
          ? process.env.MARKFIX_DESKTOP_DOWNLOAD_URL
          : undefined;
    const distribution =
      process.env[
        windows ? 'MARKFIX_DESKTOP_WINDOWS_DISTRIBUTION' : 'MARKFIX_DESKTOP_MAC_DISTRIBUTION'
      ];
    if (distribution && !['trial', 'signed'].includes(distribution))
      throw new ServiceUnavailableException('Invalid desktop distribution type');
    if (windows && downloadUrl) {
      let url: URL;
      try {
        url = new URL(downloadUrl);
      } catch {
        throw new ServiceUnavailableException('Invalid Windows installer URL');
      }
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hash ||
        !url.pathname.toLowerCase().endsWith('.exe')
      )
        throw new ServiceUnavailableException('Windows downloads require an HTTPS EXE installer');
    }
    try {
      if (compareVersions(recommendedVersion, minimumVersion) < 0)
        throw new Error('Recommended version is below minimum version');
      const status =
        compareVersions(currentVersion, minimumVersion) < 0
          ? 'upgrade-required'
          : compareVersions(currentVersion, recommendedVersion) < 0
            ? 'upgrade-recommended'
            : 'supported';
      return {
        minimumVersion,
        recommendedVersion,
        currentVersion,
        status,
        ...(downloadUrl ? { downloadUrl, ...(distribution ? { distribution } : {}) } : {}),
        features: {
          annotations: true,
          reproductionRecorder: false,
          fullPageCapture: true,
        },
      };
    } catch {
      throw new Error('Desktop version policy is misconfigured');
    }
  }
}
