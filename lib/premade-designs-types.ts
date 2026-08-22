export const PREMADE_DESIGNS_PAGE_SIZE = 36;

export interface PremadeDesign {
  id: string;
  name: string;
  path: string;
  title: string;
  folder: string;
  folderLabel: string;
}

export interface SignedPremadeDesignUrls {
  urls: Record<string, string>;
  expiresAt: number;
}
