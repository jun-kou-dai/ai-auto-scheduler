// Phase A1: ErrorBoundary - prevents white screen crashes
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.icon}>⚠</Text>
          <Text style={styles.title}>エラーが発生しました</Text>
          <Text style={styles.message}>
            {this.state.error?.message || '不明なエラー'}
          </Text>
          {this.state.errorInfo?.componentStack && (
            <Text style={styles.stack} numberOfLines={10}>
              {this.state.errorInfo.componentStack}
            </Text>
          )}
          <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>再試行</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF5F5',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#C53030',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#742A2A',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  stack: {
    fontSize: 11,
    color: '#999',
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    width: '100%',
    overflow: 'hidden',
  },
  button: {
    backgroundColor: '#C53030',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
