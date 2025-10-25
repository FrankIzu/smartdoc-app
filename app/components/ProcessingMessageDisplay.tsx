import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface ProcessingMessage {
  text: string;
  duration: number; // milliseconds
}

interface ProcessingMessageDisplayProps {
  isProcessing: boolean;
  hasRealData: boolean;
  processingType?: 'smart' | 'cot' | 'agentic' | 'general';
  onComplete?: () => void;
}

// Message arrays for different processing phases (2000ms each for better readability)
const PROCESSING_MESSAGES = {
  initial_section: [
    { text: "Analyzing your question...", duration: 2000 },
    { text: "Understanding context...", duration: 2000 },
    { text: "Preparing search strategy...", duration: 2000 },
    { text: "Initializing document search...", duration: 2000 },
    { text: "Loading knowledge base...", duration: 2000 }
  ],
  middle_section: [
    { text: "Searching through your documents...", duration: 2000 },
    { text: "Analyzing relevant content...", duration: 2000 },
    { text: "Extracting key information...", duration: 2000 },
    { text: "Cross-referencing sources...", duration: 2000 },
    { text: "Evaluating answer quality...", duration: 2000 },
    { text: "Gathering supporting evidence...", duration: 2000 },
    { text: "Synthesizing information...", duration: 2000 },
    { text: "Refining search results...", duration: 2000 },
    { text: "Building comprehensive answer...", duration: 2000 },
    { text: "Verifying citations...", duration: 2000 }
  ],
  final_section: [
    { text: "Finalizing response...", duration: 2000 },
    { text: "Preparing citations...", duration: 2000 },
    { text: "Almost ready...", duration: 2000 },
    { text: "Polishing answer...", duration: 2000 },
    { text: "Just a moment...", duration: 2000 }
  ],
  // CoT-specific messages
  cot_initial: [
    { text: "Breaking down your question...", duration: 2000 },
    { text: "Planning reasoning steps...", duration: 2000 },
    { text: "Creating step-by-step approach...", duration: 2000 },
    { text: "Analyzing query complexity...", duration: 2000 },
    { text: "Preparing multi-step search...", duration: 2000 }
  ],
  cot_middle: [
    { text: "Processing step 1 of reasoning chain...", duration: 2000 },
    { text: "Analyzing intermediate results...", duration: 2000 },
    { text: "Processing step 2 of reasoning chain...", duration: 2000 },
    { text: "Building upon previous findings...", duration: 2000 },
    { text: "Processing step 3 of reasoning chain...", duration: 2000 },
    { text: "Connecting insights across steps...", duration: 2000 },
    { text: "Validating reasoning chain...", duration: 2000 },
    { text: "Synthesizing step conclusions...", duration: 2000 },
    { text: "Refining logical flow...", duration: 2000 },
    { text: "Preparing final synthesis...", duration: 2000 }
  ],
  cot_final: [
    { text: "Synthesizing all reasoning steps...", duration: 2000 },
    { text: "Creating comprehensive answer...", duration: 2000 },
    { text: "Finalizing chain of thought...", duration: 2000 },
    { text: "Preparing detailed explanation...", duration: 2000 },
    { text: "Almost there...", duration: 2000 }
  ],
  // Agentic search specific messages
  agentic_initial: [
    { text: "Activating intelligent search agents...", duration: 2000 },
    { text: "Deploying multi-turn search strategy...", duration: 2000 },
    { text: "Initializing adaptive search...", duration: 2000 },
    { text: "Preparing iterative refinement...", duration: 2000 },
    { text: "Loading search agents...", duration: 2000 }
  ],
  agentic_middle: [
    { text: "Search agent exploring documents...", duration: 2000 },
    { text: "Refining search based on findings...", duration: 2000 },
    { text: "Agent adapting search strategy...", duration: 2000 },
    { text: "Expanding search scope...", duration: 2000 },
    { text: "Agent analyzing result quality...", duration: 2000 },
    { text: "Iterating search for better results...", duration: 2000 },
    { text: "Agent cross-checking sources...", duration: 2000 },
    { text: "Synthesizing agent findings...", duration: 2000 },
    { text: "Agent finalizing comprehensive search...", duration: 2000 },
    { text: "Preparing multi-turn results...", duration: 2000 }
  ],
  agentic_final: [
    { text: "Compiling agent findings...", duration: 2000 },
    { text: "Finalizing adaptive search results...", duration: 2000 },
    { text: "Preparing comprehensive answer...", duration: 2000 },
    { text: "Agent completing analysis...", duration: 2000 },
    { text: "Almost ready...", duration: 2000 }
  ]
};

const ProcessingMessageDisplay: React.FC<ProcessingMessageDisplayProps> = ({
  isProcessing,
  hasRealData,
  processingType = 'general',
  onComplete
}) => {
  const [currentMessage, setCurrentMessage] = useState<ProcessingMessage | null>(null);
  const [messagePhase, setMessagePhase] = useState<'initial' | 'middle' | 'final'>('initial');
  const [messageIndex, setMessageIndex] = useState(0);
  const timerRef = useRef<number | null>(null);
  const phaseStartTimeRef = useRef<number>(Date.now());
  const hasCompletedRef = useRef(false);

  // Select message arrays based on processing type
  const getMessageArrays = () => {
    switch (processingType) {
      case 'cot':
        return {
          initial: PROCESSING_MESSAGES.cot_initial,
          middle: PROCESSING_MESSAGES.cot_middle,
          final: PROCESSING_MESSAGES.cot_final
        };
      case 'agentic':
        return {
          initial: PROCESSING_MESSAGES.agentic_initial,
          middle: PROCESSING_MESSAGES.agentic_middle,
          final: PROCESSING_MESSAGES.agentic_final
        };
      default:
        return {
          initial: PROCESSING_MESSAGES.initial_section,
          middle: PROCESSING_MESSAGES.middle_section,
          final: PROCESSING_MESSAGES.final_section
        };
    }
  };

  // Reset state when processing starts
  useEffect(() => {
    if (isProcessing && !currentMessage) {
      hasCompletedRef.current = false;
      setMessagePhase('initial');
      setMessageIndex(0);
      phaseStartTimeRef.current = Date.now();
    }
  }, [isProcessing]);

  // Clean up on unmount or when processing stops (including errors)
  useEffect(() => {
    if (!isProcessing) {
      // Immediately stop all timers and clear messages
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setCurrentMessage(null);
      setMessagePhase('initial');
      setMessageIndex(0);
      hasCompletedRef.current = false;
      return;
    }
  }, [isProcessing]);

  // Handle initial phase
  useEffect(() => {
    if (!isProcessing || messagePhase !== 'initial' || hasCompletedRef.current) return;

    const messages = getMessageArrays();
    const initialMessages = messages.initial;

    if (messageIndex === 0) {
      // Pick random initial message
      const randomInitial = initialMessages[Math.floor(Math.random() * initialMessages.length)];
      setCurrentMessage(randomInitial);
      phaseStartTimeRef.current = Date.now();

      timerRef.current = setTimeout(() => {
        setMessagePhase('middle');
        setMessageIndex(0);
      }, randomInitial.duration);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isProcessing, messagePhase, messageIndex, processingType]);

  // Handle middle section cycling
  useEffect(() => {
    if (!isProcessing || messagePhase !== 'middle' || hasCompletedRef.current) return;

    // Check if real data is ready - transition to final
    if (hasRealData) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setMessagePhase('final');
      setMessageIndex(0);
      return;
    }

    const messages = getMessageArrays();
    const middleMessages = messages.middle;

    // Cycle through middle messages
    if (messageIndex < middleMessages.length) {
      const currentMsg = middleMessages[messageIndex];
      setCurrentMessage(currentMsg);

      timerRef.current = setTimeout(() => {
        setMessageIndex(prev => prev + 1);
      }, currentMsg.duration);
    } else {
      // Loop back to start of middle section if still processing
      setMessageIndex(0);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isProcessing, messagePhase, messageIndex, hasRealData, processingType]);

  // Handle final section
  useEffect(() => {
    if (!isProcessing || messagePhase !== 'final' || hasCompletedRef.current) return;

    const messages = getMessageArrays();
    const finalMessages = messages.final;
    const randomFinal = finalMessages[Math.floor(Math.random() * finalMessages.length)];
    setCurrentMessage(randomFinal);

    timerRef.current = setTimeout(() => {
      hasCompletedRef.current = true;
      if (onComplete) {
        onComplete();
      }
      // Clear current message after completion
      setCurrentMessage(null);
    }, randomFinal.duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [messagePhase, onComplete, isProcessing, processingType]);

  if (!currentMessage || !isProcessing) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.message}>{currentMessage.text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  message: {
    fontSize: 14,
    color: '#666',
  },
});

export default ProcessingMessageDisplay;
