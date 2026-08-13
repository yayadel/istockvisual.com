import { Component, type ErrorInfo, type ReactNode } from 'react';
import ImageConverterWorkspace from './ImageConverterWorkspace';

type Props = { children?: ReactNode };
type State = { error: string | null };

export class ImageConverterBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error: error.message || 'Converter failed to load' };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('ImageConverter crash', error, info);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="image-convert-page">
					<p className="image-convert-page__error">
						Converter error: {this.state.error}. Refresh the page and try again.
					</p>
				</div>
			);
		}
		return this.props.children ?? <ImageConverterWorkspace />;
	}
}

export default function ImageConverterApp() {
	return (
		<ImageConverterBoundary>
			<ImageConverterWorkspace />
		</ImageConverterBoundary>
	);
}
