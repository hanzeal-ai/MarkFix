type DesktopRegistrationInput = {
  displayName: string;
  email: string;
  password: string;
};

type DesktopPasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
};

export const desktopRegistrationInput = (input: unknown): DesktopRegistrationInput => {
  const payload =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Partial<Record<keyof DesktopRegistrationInput, unknown>>)
      : {};
  if (
    typeof payload.displayName !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.password !== 'string'
  ) {
    throw new Error('Name, email and password are required');
  }
  return {
    displayName: payload.displayName,
    email: payload.email,
    password: payload.password,
  };
};

export const desktopPasswordChangeInput = (input: unknown): DesktopPasswordChangeInput => {
  const payload =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Partial<Record<keyof DesktopPasswordChangeInput, unknown>>)
      : {};
  if (typeof payload.currentPassword !== 'string' || typeof payload.newPassword !== 'string') {
    throw new Error('Current and new passwords are required');
  }
  return { currentPassword: payload.currentPassword, newPassword: payload.newPassword };
};
