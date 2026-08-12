import { useState } from 'react';
import { authClient } from '../lib/auth-client';

export default function SignOutButton() {
	const [pending, setPending] = useState(false);

	async function signOut() {
		setPending(true);
		await authClient.signOut();
		window.location.href = '/';
	}

	return (
		<button className="btn btn--ghost" type="button" disabled={pending} onClick={signOut}>
			{pending ? 'Signing out…' : 'Sign out'}
		</button>
	);
}
