import { AudioDraftStoreProvider } from './context/audio-draft-store-context';
import { AsyncFeedbackStoreProvider } from './context/async-feedback-store-context';
import { SavedDeleteUiProvider } from './context/saved-delete-ui-context';
import { SoundNameFormProvider } from './context/sound-name-form-provider';
import { CustomSoundEditorShell } from './custom-sound-editor-shell';
import type { CustomSoundEditorProps } from './types';

/**
 * Main modal for the Custom Sound Editor. Nests one bounded provider per concern
 * (draft audio store, saved-delete UI, async feedback, sound name form), then
 * a shell that composes workflows across those slices.
 */
export const CustomSoundEditor = (props: CustomSoundEditorProps) => (
  <AudioDraftStoreProvider>
    <SavedDeleteUiProvider>
      <AsyncFeedbackStoreProvider>
        <SoundNameFormProvider>
          <CustomSoundEditorShell {...props} />
        </SoundNameFormProvider>
      </AsyncFeedbackStoreProvider>
    </SavedDeleteUiProvider>
  </AudioDraftStoreProvider>
);
