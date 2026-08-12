import { useState, type FormEvent } from 'react';
import { authClient } from '../lib/auth-client';

type Mode = 'login' | 'signup';

type Props = {
	mode: Mode;
	redirectTo?: string;
};

export default function AuthForm({ mode, redirectTo = '/account' }: Props) {
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		setError(null);
		setPending(true);

		try {
			if (mode === 'signup') {
				const result = await authClient.signUp.email({
					name: name.trim() || email.split('@')[0],
					email,
					password,
				});
				if (result.error) {
					setError(result.error.message || 'Sign up failed');
					return;
				}
			} else {
				const result = await authClient.signIn.email({
					email,
					password,
				});
				if (result.error) {
					setError(result.error.message || 'Log in failed');
					return;
				}
			}

			window.location.href = redirectTo.startsWith('/') ? redirectTo : '/account';
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unexpected error');
		} finally {
			setPending(false);
		}
	}

	return (
		<form className="form" onSubmit={onSubmit}>
			{mode === 'signup' && (
				<label>
					Name
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoComplete="name"
						placeholder="Your name"
					/>
				</label>
			)}
			<label>
				Email
				<input
					type="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					autoComplete="email"
					placeholder="you@example.com"
				/>
			</label>
			<label>
				Password
				<input
					type="password"
					required
					minLength={8}
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
					placeholder="At least 8 characters"
				/>
			</label>
			{error && <p className="error">{error}</p>}
			<button className="btn btn--primary" type="submit" disabled={pending}>
				{pending ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
			</button>
			<p className="hint">
				{mode === 'signup' ? (
					<>
						Already have an account? <a href="/login">Log in</a>
					</>
				) : (
					<>
						New here? <a href="/signup">Join free</a>
					</>
				)}
			</p>
		</form>
	);
}
