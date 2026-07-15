export type Provider = 'anthropic' | 'google';

export interface GeneratedComponent {
  id: string;
  prompt: string;
  code: string;
  createdAt: Date;
  /** true인 동안은 code가 아직 미완성 상태로 실시간으로 채워지는 중임을 나타낸다. */
  isStreaming?: boolean;
}
