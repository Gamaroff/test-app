# Animation Performance and Accessibility Guidelines

## Overview

This document establishes performance standards and accessibility requirements for animations in React Native applications, with specific focus on bottom action bar and morphing animations. These guidelines ensure consistent, smooth, and inclusive user experiences across all supported devices and user configurations.

## Performance Standards

### Frame Rate Requirements

#### Target Performance Metrics
- **Primary Target**: 60fps (16.67ms per frame)
- **Minimum Acceptable**: 55fps (18.18ms per frame)
- **Critical Threshold**: 50fps (20ms per frame) - triggers fallback

#### Device-Specific Targets
```typescript
const PERFORMANCE_TARGETS = {
  // High-end devices (iPhone 12+, Android flagship 2021+)
  tier1: {
    targetFps: 60,
    maxFrameTime: 16.67,
    memoryBudget: 2 * 1024 * 1024, // 2MB
    concurrentAnimations: 5
  },

  // Mid-range devices (iPhone 8-11, Android mid-range 2019+)
  tier2: {
    targetFps: 60,
    maxFrameTime: 18,
    memoryBudget: 1.5 * 1024 * 1024, // 1.5MB
    concurrentAnimations: 3
  },

  // Minimum supported devices (iPhone 7, Android API 23+)
  tier3: {
    targetFps: 55,
    maxFrameTime: 20,
    memoryBudget: 1 * 1024 * 1024, // 1MB
    concurrentAnimations: 2
  }
};
```

### Memory Management

#### Memory Usage Guidelines
- **Maximum Animation Memory**: 2MB additional during animation peak
- **Baseline Impact**: <500KB steady-state increase
- **Memory Pressure Response**: Automatic degradation when system pressure detected
- **Cleanup Requirements**: Complete memory release within 100ms of animation completion

#### Memory Monitoring Implementation
```typescript
import { PerformanceObserver } from 'react-native-performance';

class AnimationMemoryMonitor {
  private baselineMemory: number = 0;
  private peakMemory: number = 0;

  startMonitoring() {
    this.baselineMemory = PerformanceObserver.getUsedJSHeapSize();

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        if (entry.entryType === 'memory') {
          this.peakMemory = Math.max(this.peakMemory, entry.usedJSHeapSize);
        }
      });
    });

    observer.observe({ entryTypes: ['memory'] });
    return observer;
  }

  getMemoryDelta(): number {
    return this.peakMemory - this.baselineMemory;
  }

  isWithinBudget(budgetBytes: number): boolean {
    return this.getMemoryDelta() <= budgetBytes;
  }
}
```

### Battery Impact Guidelines

#### Power Consumption Targets
- **Maximum Increase**: 2% additional battery drain during active animation usage
- **Sustained Usage**: <0.5% per hour for typical usage patterns
- **Background Impact**: Zero additional consumption when app backgrounded

#### Power Optimization Strategies
```typescript
const POWER_OPTIMIZATION_CONFIG = {
  // Reduce animation frequency when battery low
  lowBatteryThreshold: 20, // percent
  lowBatteryFallback: 'slide', // animation type

  // Background behavior
  backgroundAnimations: false,
  backgroundFallback: 'instant', // no animation

  // Thermal throttling response
  thermalStateResponse: {
    nominal: 'morphing',
    fair: 'morphing',
    serious: 'slide',
    critical: 'instant'
  }
};
```

## Animation Optimization Techniques

### React Native Reanimated Best Practices

#### Worklet Usage
```typescript
// ✅ Correct: UI thread calculations
const morphingStyle = useAnimatedStyle(() => {
  'worklet';
  return {
    transform: [
      { scale: scale.value },
      { translateX: position.value.x },
      { translateY: position.value.y }
    ]
  };
}, []);

// ❌ Incorrect: JS thread bridge crossing
const badStyle = useAnimatedStyle(() => {
  return {
    transform: [
      { scale: someJSFunction(scale.value) } // Bridge crossing!
    ]
  };
}, []);
```

#### Shared Value Optimization
```typescript
// ✅ Efficient: Batch updates
const updateAllButtons = useCallback(() => {
  'worklet';
  buttonScales.value = buttonScales.value.map((_, index) =>
    targetScales[index]
  );
}, []);

// ❌ Inefficient: Individual updates
const badUpdate = useCallback(() => {
  buttonScales.value[0] = newScale0; // Triggers re-render
  buttonScales.value[1] = newScale1; // Triggers re-render
  buttonScales.value[2] = newScale2; // Triggers re-render
}, []);
```

#### Animation Interpolation
```typescript
// ✅ Optimal interpolation setup
const interpolatedValue = useDerivedValue(() => {
  'worklet';
  return interpolate(
    progress.value,
    [0, 0.3, 0.7, 1],
    [startValue, midValue1, midValue2, endValue],
    'clamp'
  );
}, []);
```

### Performance Monitoring

#### Real-Time Performance Tracking
```typescript
class AnimationPerformanceMonitor {
  private frameTimeHistory: number[] = [];
  private maxHistorySize = 60; // 1 second at 60fps

  recordFrame(frameTime: number) {
    this.frameTimeHistory.push(frameTime);
    if (this.frameTimeHistory.length > this.maxHistorySize) {
      this.frameTimeHistory.shift();
    }
  }

  getAverageFPS(): number {
    const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) /
                        this.frameTimeHistory.length;
    return 1000 / avgFrameTime;
  }

  getFrameDropCount(threshold: number = 20): number {
    return this.frameTimeHistory.filter(time => time > threshold).length;
  }

  shouldFallback(): boolean {
    const recentFrames = this.frameTimeHistory.slice(-30); // Last 0.5 seconds
    const avgFPS = 1000 / (recentFrames.reduce((a, b) => a + b, 0) / recentFrames.length);
    return avgFPS < 50; // Fallback if below 50fps
  }
}
```

#### Automatic Degradation
```typescript
const usePerformanceAwareAnimations = () => {
  const [performanceMode, setPerformanceMode] = useState<'high' | 'medium' | 'low'>('high');
  const monitor = useRef(new AnimationPerformanceMonitor());

  useEffect(() => {
    const checkPerformance = () => {
      const avgFPS = monitor.current.getAverageFPS();

      if (avgFPS < 45) {
        setPerformanceMode('low');
      } else if (avgFPS < 55) {
        setPerformanceMode('medium');
      } else {
        setPerformanceMode('high');
      }
    };

    const interval = setInterval(checkPerformance, 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    performanceMode,
    shouldUseMorphing: performanceMode !== 'low',
    animationDuration: performanceMode === 'low' ? 150 : 300
  };
};
```

## Accessibility Requirements

### WCAG 2.1 AA Compliance

#### Motion and Animation Guidelines
- **Success Criterion 2.3.3**: Respect prefers-reduced-motion setting
- **Success Criterion 1.4.12**: Text spacing during animations
- **Success Criterion 2.2.2**: Provide pause, stop, or hide controls for moving content

#### Implementation Requirements
```typescript
const useAccessibleAnimations = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check system preference
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setPrefersReducedMotion);

    // Listen for changes
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setPrefersReducedMotion
    );

    return () => subscription?.remove();
  }, []);

  const getAnimationConfig = useCallback(() => {
    if (prefersReducedMotion) {
      return {
        type: 'slide',
        duration: 150, // Faster for reduced motion
        easing: 'linear' // Simpler easing
      };
    }

    return {
      type: 'morphing',
      duration: 300,
      easing: 'spring'
    };
  }, [prefersReducedMotion]);

  return { prefersReducedMotion, getAnimationConfig };
};
```

### Screen Reader Support

#### State Announcements
```typescript
const useAccessibilityAnnouncements = () => {
  const announceStateChange = useCallback((newState: 'visible' | 'hidden') => {
    const message = newState === 'hidden'
      ? 'Action bar hidden. Tap center button to reveal.'
      : 'Action bar visible. Buttons are available for interaction.';

    // iOS
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }

    // Android
    if (Platform.OS === 'android') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, []);

  return { announceStateChange };
};
```

#### Focus Management
```typescript
const useFocusManagement = () => {
  const focusRef = useRef<View>(null);

  const manageFocusDuringAnimation = useCallback((animationPhase: 'start' | 'end') => {
    if (animationPhase === 'start') {
      // Temporarily disable focus during animation
      focusRef.current?.setNativeProps({
        importantForAccessibility: 'no-hide-descendants'
      });
    } else {
      // Restore focus after animation
      focusRef.current?.setNativeProps({
        importantForAccessibility: 'auto'
      });

      // Set focus to center button if in hidden state
      AccessibilityInfo.setAccessibilityFocus(
        findNodeHandle(focusRef.current)
      );
    }
  }, []);

  return { focusRef, manageFocusDuringAnimation };
};
```

### Voice Control Support

#### Voice Command Integration
```typescript
const VOICE_COMMANDS = {
  'show action bar': () => morphToVisible(),
  'hide action bar': () => morphToHidden(),
  'reveal buttons': () => morphToVisible(),
  'hide buttons': () => morphToHidden()
};

const useVoiceControlSupport = () => {
  useEffect(() => {
    // Register voice commands
    if (Platform.OS === 'ios') {
      // iOS Voice Control API integration
      VoiceControlManager.registerCommands(VOICE_COMMANDS);
    }

    return () => {
      VoiceControlManager.unregisterCommands(Object.keys(VOICE_COMMANDS));
    };
  }, []);
};
```

### High Contrast Support

#### Visual Adaptation
```typescript
const useHighContrastSupport = () => {
  const [isHighContrast, setIsHighContrast] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isHighContrastTextEnabled()
      .then(setIsHighContrast);

    const subscription = AccessibilityInfo.addEventListener(
      'highContrastTextChanged',
      setIsHighContrast
    );

    return () => subscription?.remove();
  }, []);

  const getContrastAwareStyles = useCallback((baseStyles: any) => {
    if (!isHighContrast) return baseStyles;

    return {
      ...baseStyles,
      borderWidth: Math.max(baseStyles.borderWidth || 1, 2),
      borderColor: '#000000', // High contrast border
      backgroundColor: baseStyles.backgroundColor || '#FFFFFF',
      // Ensure minimum contrast ratios
    };
  }, [isHighContrast]);

  return { isHighContrast, getContrastAwareStyles };
};
```

## Device-Specific Optimizations

### iOS Optimizations

#### Metal Rendering
```typescript
const IOS_ANIMATION_CONFIG = {
  // Leverage Metal rendering
  shouldRasterizeIOS: true,
  renderToHardwareTextureAndroid: true,

  // iOS-specific optimizations
  useNativeDriver: true,
  isInteraction: false, // Prevent gesture conflicts

  // Core Animation integration
  layer: {
    allowsGroupOpacity: false,
    shouldRasterize: true,
    rasterizationScale: PixelRatio.get()
  }
};
```

#### System Integration
```typescript
const useIOSSystemIntegration = () => {
  const [systemAnimationsEnabled, setSystemAnimationsEnabled] = useState(true);

  useEffect(() => {
    // Respect iOS system animation settings
    AccessibilityInfo.isReduceMotionEnabled()
      .then(reduceMotion => {
        setSystemAnimationsEnabled(!reduceMotion);
      });
  }, []);

  return { systemAnimationsEnabled };
};
```

### Android Optimizations

#### Hardware Acceleration
```typescript
const ANDROID_ANIMATION_CONFIG = {
  // Hardware acceleration
  renderToHardwareTextureAndroid: true,
  useNativeDriver: true,

  // Android-specific optimizations
  enableHardwareAcceleration: true,
  layerType: 'hardware',

  // GPU rendering
  transform: [
    { perspective: 1000 }, // Enable 3D acceleration
  ]
};
```

#### API Level Adaptations
```typescript
const useAndroidApiAdaptations = () => {
  const apiLevel = Platform.Version;

  const getOptimalConfig = useCallback(() => {
    if (apiLevel >= 28) {
      // Android 9+ optimizations
      return {
        useDisplayP3: true,
        enableVulkanAPI: true,
        hardwareAccelerated: true
      };
    } else if (apiLevel >= 23) {
      // Android 6+ basic support
      return {
        useDisplayP3: false,
        enableVulkanAPI: false,
        hardwareAccelerated: true
      };
    } else {
      // Fallback for older versions
      return {
        useDisplayP3: false,
        enableVulkanAPI: false,
        hardwareAccelerated: false
      };
    }
  }, [apiLevel]);

  return { apiLevel, getOptimalConfig };
};
```

## Testing and Validation

### Performance Testing

#### Automated Performance Tests
```typescript
describe('Animation Performance', () => {
  let performanceMonitor: AnimationPerformanceMonitor;

  beforeEach(() => {
    performanceMonitor = new AnimationPerformanceMonitor();
  });

  test('maintains 60fps during morphing animation', async () => {
    const { startAnimation, endAnimation } = renderHook(() =>
      useMorphingAnimations(testConfig)
    ).result.current;

    performanceMonitor.startMonitoring();

    // Execute animation
    act(() => {
      startAnimation();
    });

    // Wait for animation completion
    await waitFor(() => {
      expect(performanceMonitor.isAnimationComplete()).toBe(true);
    }, { timeout: 500 });

    // Validate performance
    const avgFPS = performanceMonitor.getAverageFPS();
    expect(avgFPS).toBeGreaterThanOrEqual(55);

    const frameDropCount = performanceMonitor.getFrameDropCount();
    expect(frameDropCount).toBeLessThan(3);
  });

  test('memory usage stays within budget', async () => {
    const memoryMonitor = new AnimationMemoryMonitor();
    const observer = memoryMonitor.startMonitoring();

    // Execute multiple animations
    for (let i = 0; i < 10; i++) {
      await performAnimation();
    }

    observer.disconnect();

    const memoryDelta = memoryMonitor.getMemoryDelta();
    expect(memoryDelta).toBeLessThan(2 * 1024 * 1024); // 2MB
  });
});
```

#### Device-Specific Testing
```typescript
const DEVICE_TEST_MATRIX = {
  'iPhone 7': { tier: 3, expectFallback: false },
  'iPhone 8': { tier: 2, expectFallback: false },
  'iPhone 12': { tier: 1, expectFallback: false },
  'Samsung Galaxy S8': { tier: 2, expectFallback: false },
  'Samsung Galaxy S21': { tier: 1, expectFallback: false },
  'Budget Android': { tier: 3, expectFallback: true }
};

Object.entries(DEVICE_TEST_MATRIX).forEach(([device, config]) => {
  test(`performance on ${device}`, async () => {
    // Mock device capabilities
    mockDeviceCapabilities(config.tier);

    const result = await performanceTest();

    if (config.expectFallback) {
      expect(result.animationType).toBe('slide');
    } else {
      expect(result.animationType).toBe('morphing');
    }

    expect(result.avgFPS).toBeGreaterThanOrEqual(
      config.tier === 3 ? 50 : 55
    );
  });
});
```

### Accessibility Testing

#### Automated Accessibility Tests
```typescript
describe('Animation Accessibility', () => {
  test('respects reduce motion preference', async () => {
    // Mock reduce motion enabled
    mockAccessibilityInfo({
      isReduceMotionEnabled: true
    });

    const { animationType } = renderHook(() =>
      useAnimationFallback(3, 1)
    ).result.current;

    expect(animationType).toBe('slide');
  });

  test('provides screen reader announcements', async () => {
    const announcementSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    const { morphToHidden } = renderHook(() =>
      useMorphingAnimations(testConfig)
    ).result.current;

    act(() => {
      morphToHidden();
    });

    await waitFor(() => {
      expect(announcementSpy).toHaveBeenCalledWith(
        expect.stringContaining('Action bar hidden')
      );
    });
  });
});
```

#### Manual Accessibility Testing Checklist
- [ ] VoiceOver (iOS) navigation works correctly
- [ ] TalkBack (Android) navigation works correctly
- [ ] Reduce motion preference is respected
- [ ] High contrast mode maintains visibility
- [ ] Voice Control commands work (iOS)
- [ ] Switch Control navigation works
- [ ] Screen reader announcements are clear and timely
- [ ] Focus management during animations is correct

## Monitoring and Alerting

### Production Monitoring

#### Performance Metrics Collection
```typescript
class ProductionAnimationMonitor {
  private metricsCollector: MetricsCollector;

  constructor() {
    this.metricsCollector = new MetricsCollector({
      service: 'example-component',
      namespace: 'animations'
    });
  }

  recordAnimationPerformance(metrics: {
    animationType: string;
    duration: number;
    avgFPS: number;
    memoryDelta: number;
    deviceTier: number;
  }) {
    this.metricsCollector.record('animation_performance', {
      ...metrics,
      timestamp: Date.now()
    });
  }

  recordFallbackUsage(reason: string, deviceInfo: any) {
    this.metricsCollector.record('animation_fallback', {
      reason,
      deviceInfo,
      timestamp: Date.now()
    });
  }
}
```

#### Alert Conditions
```typescript
const ALERT_THRESHOLDS = {
  // Performance alerts
  avgFPSBelow: 45,
  memoryUsageAbove: 3 * 1024 * 1024, // 3MB
  fallbackRateAbove: 0.15, // 15%

  // Accessibility alerts
  reduceMotionFailureRate: 0.01, // 1%
  screenReaderIssues: 0.05, // 5%

  // Error rates
  animationFailureRate: 0.02, // 2%
  crashesDuringAnimation: 0.001 // 0.1%
};
```

## Best Practices Summary

### Do's
✅ Always use `'worklet'` directive for UI thread calculations
✅ Batch shared value updates to minimize re-renders
✅ Respect system accessibility preferences
✅ Monitor performance in production
✅ Provide fallback animations for low-performance scenarios
✅ Test on minimum supported device specifications
✅ Use hardware acceleration when available
✅ Clean up animation resources properly

### Don'ts
❌ Don't perform heavy calculations on the UI thread
❌ Don't ignore reduce motion accessibility preferences
❌ Don't assume all devices can handle complex animations
❌ Don't leave animations running when app is backgrounded
❌ Don't rely solely on visual cues (provide audio/haptic feedback)
❌ Don't forget to test with screen readers enabled
❌ Don't implement animations without performance monitoring
❌ Don't use animations that could trigger seizures (rapid flashing)

### Performance Optimization Checklist
- [ ] All animations use React Native Reanimated worklets
- [ ] Shared values are used efficiently
- [ ] Memory usage is monitored and limited
- [ ] Automatic fallback mechanisms are implemented
- [ ] Device-specific optimizations are applied
- [ ] Battery impact is minimized
- [ ] Thermal throttling is handled gracefully

### Accessibility Compliance Checklist
- [ ] WCAG 2.1 AA compliance verified
- [ ] Reduce motion preference respected
- [ ] Screen reader compatibility tested
- [ ] High contrast support implemented
- [ ] Voice control integration working
- [ ] Focus management during animations correct
- [ ] Timing requirements met (no auto-advancing content >5 seconds)

This comprehensive guide ensures that all animations meet high standards for performance, accessibility, and user experience across all supported devices and user configurations.