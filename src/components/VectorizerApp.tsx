import { Component, type ErrorInfo, type ReactNode } from 'react';
import VectorizerWorkspace from './VectorizerWorkspace';

type Props = { children?: ReactNode };
type State = { error: string | null };

class Boundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error: error.message || 'Vectorizer failed to load' };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('Vectorizer crash', error, info);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="tools-work">
					<p className="tools-work__error">
						Vectorizer error: {this.state.error}. Refresh and try a smaller image.
					</p>
				</div>
			);
		}
		return this.props.children ?? <VectorizerWorkspace />;
	}
}

export default function VectorizerApp() {
	return (
		<Boundary>
			<VectorizerWorkspace />
		</Boundary>
	);
}
