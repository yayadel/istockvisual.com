import { Component, type ErrorInfo, type ReactNode } from 'react';
import SocialResizerWorkspace from './SocialResizerWorkspace';

type Props = { children?: ReactNode };
type State = { error: string | null };

class Boundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error: error.message || 'Social resizer failed' };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('SocialResizer crash', error, info);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="tools-work">
					<p className="tools-work__error">
						Social Resizer error: {this.state.error}. Refresh the page and try again.
					</p>
				</div>
			);
		}
		return this.props.children ?? <SocialResizerWorkspace />;
	}
}

export default function SocialResizerApp() {
	return (
		<Boundary>
			<SocialResizerWorkspace />
		</Boundary>
	);
}
