import { useState, type ReactElement } from 'react';
import cls from 'classnames';

import { type UpdaterStatus } from '~main/types';
import { api } from '~renderer/utils/api';

import Button from './styled/Button';
import DialogButton from './styled/DialogButton';
import ClientDirDialog from './ClientDirDialog';

const LaunchPanel = () => {
	const [status, setStatus] = useState<UpdaterStatus>({ state: 'verifying' });
	api.updater.observe.useSubscription(undefined, {
		onData: data => setStatus(data)
	});

	const verify = api.updater.verify.useMutation();
	const update = api.updater.update.useMutation();
	const updatePortable = api.updater.updatePortable.useMutation();
	const start = api.launcher.start.useMutation();

	const props: Record<
		UpdaterStatus['state'],
		{ button: ReactElement; helperText?: ReactElement }
	> = {
		needsValidation: {
			button: <Button onClick={() => verify.mutateAsync()}>Verify</Button>,
			helperText: (
				<div className="-mb-2">
					<p>New changes detected</p>
					<p className="text-xs text-textDark">Please verify your game data</p>
				</div>
			)
		},
		verifying: { button: <Button disabled>Verifying</Button> },
		serverUnreachable: {
			button: <Button onClick={() => verify.mutateAsync()}>Retry</Button>,
			helperText: (
				<div className="-mb-2">
					<p>
						<span className="text-secondary">Error: </span> Failed to reach
						update server
					</p>
					<p className="text-xs text-textDark">Please try again later</p>
				</div>
			)
		},
		noClient: {
			button: (
				<DialogButton
					clickAway
					dialog={close => <ClientDirDialog close={close} />}
				>
					{open => (
						<Button primary onClick={open}>
							Locate client
						</Button>
					)}
				</DialogButton>
			),
			helperText: (
				<div className="-mb-2">
					<p>Client location was not yet selected</p>
					<p className="text-xs text-textDark">
						Please select your World of Warcraft 3.3.5 location
					</p>
				</div>
			)
		},
		launcherOutdated: {
			button: (
				<Button onClick={() => updatePortable.mutateAsync()}>Update</Button>
			),
			helperText: (
				<div className="-mb-2">
					<p>New launcher version available!</p>
					<p className="text-xs text-textDark">
						Please update to the latest version
					</p>
				</div>
			)
		},
		updateAvailable: {
			button: <Button onClick={() => update.mutateAsync()}>Update</Button>,
			helperText: (
				<div className="-mb-2">
					<p>Update available!</p>
					<p className="text-xs text-textDark">
						With total download size{' '}
						<span className="text-xs text-text">{status.message}</span>
					</p>
				</div>
			)
		},
		updating: { button: <Button disabled>Updating</Button> },
		upToDate: {
			button: (
				<Button primary onClick={() => start.mutateAsync()}>
					Play
				</Button>
			),
			helperText: (
				<div className="-mb-2">
					<p>Everything up to date!</p>
				</div>
			)
		},
		failed: {
			button: <Button onClick={() => verify.mutateAsync()}>Retry</Button>,
			helperText: (
				<div className="-mb-2">
					<p>
						<span className="text-secondary">Error: </span>
						{status.message}
					</p>
					<p className="text-xs text-textDark">
						Verify your game data by clicking Retry.
					</p>
				</div>
			)
		}
	};

	return (
		<div className="flex gap-3">
			<div className="flex flex-grow select-none flex-col justify-end gap-3">
				{props[status.state].helperText ??
					(status.message && <p className="-mb-2 text-xs">{status.message}</p>)}
				<div className="loading-wrapper">
					{status.progress !== undefined && (
						<div
							className={cls('loading', {
								'loading-unknown': status.progress === -1
							})}
							style={
								status.progress !== -1
									? {
											clipPath: `inset(0 ${
												100 - Math.ceil(Math.abs(status.progress) * 100)
											}% 0 0)`
									  }
									: undefined
							}
						/>
					)}
				</div>
			</div>
			{props[status.state].button}
		</div>
	);
};

export default LaunchPanel;
