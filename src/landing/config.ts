// Fill these in to switch the landing page's buttons and waitlist on.
// Anything left empty is hidden or shows a friendly "coming soon".

export const LINKS = {
  /** Discord invite, e.g. "https://discord.gg/abc123". */
  discord: '',
  /** Survey (Google Form) link, e.g. "https://forms.gle/xyz". */
  survey: '',
};

/**
 * Waitlist = a Google Form with one "Email" short-answer question.
 * formAction: the form's ".../formResponse" URL. emailField: that question's "entry.123456789" name.
 */
export const WAITLIST = {
  formAction: '',
  emailField: '',
};
