import type {
  AiProviderRequest,
  AiProviderResult,
} from "../domain/types";

export interface AiProvider {
  generateAnswer(request: AiProviderRequest): Promise<AiProviderResult>;
}

