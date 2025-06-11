import { Download, FolderPen } from 'lucide-react';

import { api } from '~renderer/utils/api';

import TextButton from './styled/TextButton';
import CheckboxInput from './form/CheckboxInput';
import DialogButton from './styled/DialogButton';
import ClientDirDialog from './ClientDirDialog';
import CloseButton from './styled/CloseButton';

type Props = { close: () => void };

const PreferencesDialog = ({ close }: Props) => {
	const { data: pref } = api.preferences.get.useQuery();
	const setPref = api.preferences.set.useMutation();

	const update = api.updater.update.useMutation();

	return (
		<div className="dialog">
			<CloseButton close={close} />
			<h2 className="color mb-2 text-xl">Settings</h2>

			<div className="flex w-full flex-col">
				<h3 className="color text-lg">Game</h3>
				<div className="flex w-full items-center gap-2 pl-2">
					<span className="shrink-0">Install directory:</span>
					<span
						title={pref?.clientDir}
						className="min-w-0 shrink grow overflow-hidden text-ellipsis text-textDark"
					>
						{pref?.clientDir ? pref?.clientDir : 'Not selected'}
					</span>
					<DialogButton
						dialog={close => <ClientDirDialog close={close} />}
						clickAway={pref?.isPortable}
					>
						{open => (
							<TextButton icon={FolderPen} onClick={open}>
								Change
							</TextButton>
						)}
					</DialogButton>
				</div>
				<CheckboxInput
					value={pref?.cleanWdb ?? false}
					setValue={v => setPref.mutateAsync({ cleanWdb: v })}
					label="Clean WDB on each launch"
				/>
			</div>

			<div className="flex flex-col">
				<h3 className="color text-lg">Launcher</h3>
				<CheckboxInput
					value={pref?.reopenLauncher ?? false}
					setValue={v => setPref.mutateAsync({ reopenLauncher: v })}
					label="Reopen launcher after WoW closes"
				/>
				<CheckboxInput
					value={pref?.rememberPosition ?? false}
					setValue={v => setPref.mutateAsync({ rememberPosition: v })}
					label="Remember position & size of launcher window"
				/>
				<TextButton
					icon={Download}
					onClick={() => {
						close();
						update.mutateAsync(true);
					}}
				>
					Force update
				</TextButton>
			</div>
		</div>
	);
};

export default PreferencesDialog;
