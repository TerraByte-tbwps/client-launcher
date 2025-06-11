import cls from 'classnames';
import { useState, type ReactNode } from 'react';

import { api } from '~renderer/utils/api';

type LargeButtonProps = {
	active?: boolean;
	loading?: boolean;
	onClick?: () => void;
	children: ReactNode;
};

const LargeButton = ({
	active,
	loading,
	onClick,
	children
}: LargeButtonProps) => (
	<button
		type="button"
		onClick={onClick}
		className={cls(
			'rounded border bg-dark p-4 text-xl uppercase',
			active ? 'color' : 'text-textDark',
			loading && 'pointer-events-none opacity-50'
		)}
	>
		{children}
	</button>
);

const RealmSwitch = () => {
	const { data: pref } = api.preferences.get.useQuery();
	const setPref = api.preferences.set.useMutation();

	const invalidate = api.updater.invalidate.useMutation();

	const [isLoading, setIsLoading] = useState(false);
	api.updater.observe.useSubscription(undefined, {
		onData: data =>
			setIsLoading(data.state === 'verifying' || data.state === 'updating')
	});

	const onClick = async (plusEnabled: boolean) => {
		if (isLoading) return;
		await setPref.mutateAsync({ plusEnabled });
		await invalidate.mutateAsync();
	};

	return (
		<>
			<p className="text-2xl">Welcome To</p>
			<p className="text-2xl">The Best WoW</p>
			
		</>
	);
};

export default RealmSwitch;
