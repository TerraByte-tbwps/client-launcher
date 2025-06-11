import { Fragment, useState } from 'react';

import { api } from '~renderer/utils/api';
import { FileMap } from '~common/constants';

import CheckboxInput from './form/CheckboxInput';
import IconSpinner from './styled/IconSpinner';

const OptionalPatches = () => {
	const { data: pref } = api.preferences.get.useQuery();
	const setPref = api.preferences.set.useMutation();

	const invalidate = api.updater.invalidate.useMutation();

	const [isLoading, setIsLoading] = useState(false);
	api.updater.observe.useSubscription(undefined, {
		onData: data =>
			setIsLoading(data.state === 'verifying' || data.state === 'updating')
	});

	return (
		<>
			<p className="text-lg">Optional patches:</p>
			<div className="surface relative grid grid-cols-[1fr_auto] items-center gap-x-2">
				{isLoading && (
					<div className="absolute flex h-full w-full items-center justify-center bg-dark/50">
						<IconSpinner />
					</div>
				)}
				{Object.entries(FileMap)
					.filter(v => v[1].optional)
					.map(([patch, meta]) => (
						<Fragment key={patch}>
							<CheckboxInput
								value={pref?.optionalPatches.includes(patch) ?? false}
								setValue={async v => {
									if (isLoading) return;
									await setPref.mutateAsync({
										optionalPatches: !v
											? (pref?.optionalPatches ?? []).filter(p => p !== patch)
											: [...(pref?.optionalPatches ?? []), patch]
									});
									await invalidate.mutateAsync();
								}}
								label={meta.label ?? patch}
							/>
							<p className="text-xs text-textDark">{meta.description}</p>
						</Fragment>
					))}
			</div>
		</>
	);
};

export default OptionalPatches;
