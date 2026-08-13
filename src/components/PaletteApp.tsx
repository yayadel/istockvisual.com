import { Component, type ErrorInfo, type ReactNode } from 'react';
import PaletteWorkspace from './PaletteWorkspace';

type Props = { children?: ReactNode };
type State = { error: string | null };

class Boundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error: error.message || 'Palette tool failed' };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('Palette crash', error, info);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="tools-work">
					<p className="tools-work__error">
						Palette error: {this.state.error}. Refresh the page and try again.
					</p>
				</div>
			);
		}
		return this.props.children ?? <PaletteWorkspace />;
	}
}

export default function PaletteApp() {
	return (
		<Boundary>
			<PaletteWorkspace />
		</Boundary>
	);
}
