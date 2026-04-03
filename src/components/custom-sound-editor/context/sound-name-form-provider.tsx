import type { ReactNode } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import type { SoundNameForm } from '../types';

/**
 * Owns the sound name field only (RHF). Avoids duplicating this state in Zustand,
 * which would fight validation and watch() used for save.
 */
export function SoundNameFormProvider({ children }: { children: ReactNode }) {
  const methods = useForm<SoundNameForm>({
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: { soundName: '' },
  });

  return <FormProvider {...methods}>{children}</FormProvider>;
}
