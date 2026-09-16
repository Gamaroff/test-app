# Validation Patterns

This document outlines common validation patterns, rules, and error handling strategies used throughout NestJS application DTOs and types.

## Validation Framework

A robust API validation strategy uses a **4-layer approach**:

1. **Type-level validation** (compile time) - TypeScript strict mode
2. **Decorator validation** (runtime) - class-validator 
3. **Business logic validation** (application layer) - Domain rules
4. **Security validation** (cross-cutting) - CSRF, rate limiting, authorization

## Common Validation Decorators

### String Validation
```typescript
// Basic string validation
@IsString()
@IsNotEmpty()
@MinLength(3)
@MaxLength(50)
@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
field!: string;

// Slug validation (URL-safe identifier)
@Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
  message: 'Slug must contain only lowercase letters, numbers, and hyphens, and start/end with alphanumeric'
})
slug!: string;

// Email validation
@IsEmail({}, { message: 'Please provide a valid email address' })
email!: string;

// Phone number validation (international format)
@Matches(/^\+[1-9]\d{1,14}$/, {
  message: 'Phone number must be in international format (+country code + number)'
})
phoneNumber!: string;
```

### Numeric Validation
```typescript
// Positive numbers (financial amounts)
@IsNumber({ maxDecimalPlaces: 8 }, { message: 'Amount must be a valid number with max 8 decimal places' })
@Min(0.01, { message: 'Amount must be greater than 0.01' })
@Max(1000000, { message: 'Amount cannot exceed 1,000,000' })
amount!: number;

// Integer validation
@IsInt({ message: 'Value must be an integer' })
@Min(1)
@Max(100)
quantity!: number;

// Percentage validation
@IsNumber()
@Min(0, { message: 'Percentage cannot be negative' })
@Max(100, { message: 'Percentage cannot exceed 100%' })
percentage!: number;
```

### Enum Validation
```typescript
// Single enum validation
@IsEnum(OrderStatus, { 
  message: 'Status must be one of: pending, processing, shipped, delivered, cancelled' 
})
status!: OrderStatus;

// Array of enum values
@IsEnum(UserRole, { each: true })
@IsArray()
@ArrayMinSize(1)
roles!: UserRole[];
```

### Date Validation
```typescript
// ISO date string validation
@IsISO8601({}, { message: 'Date must be in ISO 8601 format' })
@Transform(({ value }) => typeof value === 'string' ? new Date(value).toISOString() : value)
dueDate!: string;

// Future date validation
@IsDateString()
@Validate(IsFutureDate, { message: 'Date must be in the future' })
scheduledAt!: string;

// Date range validation
@IsOptional()
@IsDateString()
@Validate(IsAfterStartDate, ['startDate'], { message: 'End date must be after start date' })
endDate?: string;
```

### Object and Array Validation
```typescript
// Nested object validation
@IsObject()
@ValidateNested()
@Type(() => AddressDto)
address!: AddressDto;

// Array validation with nested objects
@IsArray()
@ArrayMinSize(1)
@ArrayMaxSize(10)
@ValidateNested({ each: true })
@Type(() => LineItemDto)
lineItems!: LineItemDto[];

// Optional object with default
@IsOptional()
@IsObject()
@ValidateNested()
@Type(() => MetadataDto)
metadata?: MetadataDto = {};
```

## Domain-Specific Validation Patterns

### Financial Validation
```typescript
// Currency code validation (ISO 4217)
@IsString()
@Length(3, 3)
@Matches(/^[A-Z]{3}$/, { message: 'Currency must be ISO 4217 format (e.g., USD, EUR, GBP)' })
@Transform(({ value }) => typeof value === 'string' ? value.toUpperCase().trim() : value)
currency!: string;

// Account number validation (banking)
@IsString()
@MinLength(4)
@MaxLength(34) // IBAN can be up to 34 characters
@Matches(/^[0-9A-Z]+$/, {
  message: 'Account number must contain only alphanumeric characters'
})
@Transform(({ value }) => typeof value === 'string' ? value.replace(/\s/g, '').toUpperCase() : value)
accountNumber!: string;

// SWIFT/BIC code validation
@IsString()
@MinLength(8)
@MaxLength(11)
@Matches(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, {
  message: 'Invalid SWIFT/BIC code format'
})
@Transform(({ value }) => typeof value === 'string' ? value.toUpperCase().trim() : value)
bankCode!: string;
```

### Identity Validation
```typescript
// Slug/username validation (URL-safe, no special prefix)
@IsString()
@MinLength(3)
@MaxLength(50)
@Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/, {
  message: 'Username must contain only alphanumeric characters, dots, underscores, and hyphens'
})
@Transform(({ value }) => typeof value === 'string' ? value.toLowerCase().trim() : value)
username!: string;

// Country code validation (ISO 3166-1 alpha-2)
@IsString()
@Length(2, 2)
@Matches(/^[A-Z]{2}$/, { message: 'Country code must be ISO 3166-1 alpha-2 format' })
@Transform(({ value }) => typeof value === 'string' ? value.toUpperCase().trim() : value)
country!: string;

// Password validation
@IsString()
@MinLength(8, { message: 'Password must be at least 8 characters long' })
@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
  message: 'Password must contain uppercase, lowercase, number, and special character'
})
password!: string;
```

### File Upload Validation
```typescript
// Media file metadata validation
@IsString()
@IsNotEmpty()
@Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
fileName!: string;

@IsEnum(['image', 'video', 'audio', 'document'], {
  message: 'Media type must be image, video, audio, or document'
})
mediaType!: string;

@IsString()
@Matches(/^[a-zA-Z0-9]+\/[a-zA-Z0-9\-\.]+$/, {
  message: 'Invalid MIME type format'
})
mimeType!: string;

@IsNumber()
@Min(1, { message: 'File size must be greater than 0' })
@Max(104857600, { message: 'File size cannot exceed 100MB' })
fileSize!: number;

@IsString()
@IsUrl({}, { message: 'Invalid URL format' })
url!: string;
```

## Advanced Validation Patterns

### Discriminated Union Validation
```typescript
// Different payload shapes based on a type discriminator
export class CreateShipmentDto {
  @IsEnum(ShipmentMethod)
  method!: ShipmentMethod;

  @IsObject()
  @ValidateNested()
  @Type((options) => {
    const method = (options?.object as any)?.method;
    switch (method) {
      case ShipmentMethod.EXPRESS: return ExpressDetailsDto;
      case ShipmentMethod.STANDARD: return StandardDetailsDto;
      case ShipmentMethod.OVERNIGHT: return OvernightDetailsDto;
      default: return BaseShipmentDetailsDto;
    }
  })
  details!: ShipmentDetailsUnion;
}
```

### Conditional Validation
```typescript
// Validate field only if another field has specific value
@ValidateIf(o => o.type === 'scheduled')
@IsISO8601()
scheduledAt?: string;

// Cross-field validation
@Validate(PasswordMatchesConfirmation, ['passwordConfirmation'])
password!: string;

// Custom validation with context
@Validate(IsValidCurrencyForCountry, ['country'], {
  message: 'Selected currency is not supported in the specified country'
})
currency!: string;
```

### Array Validation Patterns
```typescript
// Members array with size limits
@IsArray()
@ArrayMinSize(2, { message: 'Group must have at least 2 members' })
@ArrayMaxSize(50, { message: 'Group cannot have more than 50 members' })
@IsString({ each: true })
@ArrayUnique({ message: 'Member IDs must be unique' })
memberIds!: string[];

// Permission arrays with enum validation
@IsOptional()
@IsArray()
@IsEnum(Permission, { each: true })
permissions?: Permission[];
```

## Custom Validator Examples

### Business Logic Validators
```typescript
// Custom validator for slug availability
@ValidatorConstraint({ name: 'slugAvailable', async: true })
export class IsSlugAvailable implements ValidatorConstraintInterface {
  async validate(slug: string, args: ValidationArguments) {
    const productService = container.get(ProductService);
    const exists = await productService.slugExists(slug);
    return !exists;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Slug $value is already taken';
  }
}

// Usage in DTO
@Validate(IsSlugAvailable)
slug!: string;
```

### Resource Validators
```typescript
// Check that a referenced resource exists and is accessible
@ValidatorConstraint({ name: 'categoryExists', async: true })
export class IsCategoryValid implements ValidatorConstraintInterface {
  async validate(categoryId: string, args: ValidationArguments) {
    const { regionCode } = args.object as any;
    const categoryService = container.get(CategoryService);
    return categoryService.isAvailableInRegion(categoryId, regionCode);
  }

  defaultMessage(args: ValidationArguments): string {
    const { regionCode } = args.object as any;
    return `Category not available in region ${regionCode}`;
  }
}
```

## Error Handling Patterns

### Field-Specific Errors
```typescript
// Map validation errors to specific fields
{
  "success": false,
  "error": {
    "code": "VAL_003",
    "message": "Validation failed",
    "field": "slug",
    "details": {
      "constraints": {
        "matches": "Slug must contain only lowercase letters, numbers, and hyphens",
        "slugAvailable": "Slug 'my-product' is already taken"
      },
      "value": "my-product"
    }
  }
}
```

### Nested Validation Errors
```typescript
// Errors in nested objects
{
  "success": false,
  "error": {
    "code": "VAL_002",
    "message": "Validation failed in nested object",
    "field": "address.postalCode",
    "details": {
      "property": "address",
      "constraints": {
        "matches": "Invalid postal code format"
      },
      "children": [
        {
          "property": "postalCode", 
          "value": "invalid",
          "constraints": {
            "matches": "Invalid postal code format"
          }
        }
      ]
    }
  }
}
```

## Security Validation

### Input Sanitization
```typescript
// Automatic string sanitization
@Transform(({ value }) => {
  if (typeof value !== 'string') return value;
  return value
    .trim()                    // Remove whitespace
    .replace(/\s+/g, ' ')     // Normalize multiple spaces
    .slice(0, 1000);          // Prevent extremely long strings
})
userInput!: string;

// Case normalization for identifiers  
@Transform(({ value }) => typeof value === 'string' ? value.toLowerCase().trim() : value)
username!: string;

@Transform(({ value }) => typeof value === 'string' ? value.toUpperCase().trim() : value)
currencyCode!: string;
```

### PII Protection
```typescript
// Remove spaces from sensitive data
@Transform(({ value }) => typeof value === 'string' ? value.replace(/\s/g, '').toUpperCase() : value)
accountNumber!: string;

// Normalize phone numbers
@Transform(({ value }) => typeof value === 'string' ? value.replace(/\s/g, '') : value)
phoneNumber!: string;

// Sanitize file names
@Transform(({ value }) => {
  if (typeof value !== 'string') return value;
  return value.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 255);
})
filename!: string;
```

## Financial Validation Patterns

### Amount Validation
```typescript
// Standard monetary amount
@IsNumber({ maxDecimalPlaces: 2 }, { message: 'Amount must have maximum 2 decimal places' })
@Min(0.01, { message: 'Amount must be at least 0.01' })
@Max(1000000, { message: 'Amount cannot exceed 1,000,000' })
amount!: number;

// Cryptocurrency amount (up to 8 decimal places)
@IsNumber({ maxDecimalPlaces: 8 })
@Min(0.00000001)
@Max(21000000)
cryptoAmount!: number;

// Percentage-based amounts
@IsNumber({ maxDecimalPlaces: 4 })
@Min(0)
@Max(100)
feePercentage!: number;
```

### Currency Validation
```typescript
// Supported currencies validation
@IsEnum(['USD', 'EUR', 'GBP'], {
  message: 'Currency must be one of: USD, EUR, GBP'
})
currency!: string;

// Dynamic currency validation (business rule)
@Validate(IsSupportedCurrencyForCountry, ['country'])
currency!: string;
```

## Business Rule Validation

### Tier-Based Limits
```typescript
// Amount limits based on subscription tier
@Validate(IsWithinTierLimits, ['userTier'], {
  message: 'Amount exceeds the limit for your subscription tier'
})
amount!: number;

// Feature access based on tier
@ValidateIf(o => o.requiresPremium)
@Validate(IsPremiumUser, {
  message: 'Upgrade to premium to access this feature'
})
@IsOptional()
premiumFeatureConfirmation?: boolean;
```

### Resource Ownership
```typescript
// Prevent operations on your own resources (e.g., self-follow)
@Validate(IsNotSelf, {
  message: 'Cannot perform this action on your own account'
})
targetUserId!: string;

// Enforce progression rules (e.g., status can only move forward)
@Validate(IsValidStatusTransition, ['currentStatus'], {
  message: 'Invalid status transition'
})
newStatus!: OrderStatus;
```

### Conditional Amount Validation
```typescript
// Balance check for outbound operations
@ValidateIf(o => o.direction === TransferDirection.OUTBOUND)
@Validate(HasSufficientFunds, ['accountId', 'amount', 'currency'])
direction!: TransferDirection;

// Fee reasonableness check
@IsOptional()
@IsNumber({ maxDecimalPlaces: 8 })
@Min(0)
@Validate(IsReasonableFee, ['amount'], {
  message: 'Fee seems unreasonably high for this transaction amount'
})
networkFee?: number;
```

## Custom Validation Classes

### Slug Validation
```typescript
@ValidatorConstraint({ name: 'slugFormat', async: false })
export class SlugFormatValidator implements ValidatorConstraintInterface {
  validate(slug: string): boolean {
    if (slug.length < 3 || slug.length > 100) return false;
    if (!/^[a-z0-9]/.test(slug) || !/[a-z0-9]$/.test(slug)) return false;
    return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug);
  }

  defaultMessage(): string {
    return 'Slug must be 3-100 lowercase characters with only letters, numbers, and hyphens.';
  }
}
```

### Region-Aware Category Validation
```typescript
@ValidatorConstraint({ name: 'categoryValidForRegion', async: true })
export class IsCategoryValidForRegion implements ValidatorConstraintInterface {
  async validate(categoryId: string, args: ValidationArguments): Promise<boolean> {
    const { regionCode } = args.object as any;
    const categoryService = container.get(CategoryService);
    const available = await categoryService.getAvailableForRegion(regionCode);
    return available.includes(categoryId);
  }

  defaultMessage(args: ValidationArguments): string {
    const { regionCode } = args.object as any;
    return `Category not available in region ${regionCode}`;
  }
}
```

## Validation Pipe Configuration

### Global Validation Settings
```typescript
// Applied globally in main.ts
app.useGlobalPipes(new ValidationPipe({
  transform: true,           // Enable automatic transformation
  whitelist: true,          // Strip unknown properties  
  forbidNonWhitelisted: true, // Throw error on unknown properties
  validateCustomDecorators: true, // Enable custom validators
  dismissDefaultMessages: false, // Keep default error messages
  stopAtFirstError: false,   // Collect all validation errors
  errorHttpStatusCode: 422,  // Use 422 for validation errors
  exceptionFactory: (errors: ValidationError[]) => {
    // Custom error format for consistent API responses
    return new ValidationException(errors);
  }
}));
```

### Controller-Specific Validation
```typescript
// Override validation pipe for specific endpoints
@Post('upload')
@UsePipes(new ValidationPipe({
  fileIsRequired: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf']
}))
async uploadFile(@Body() uploadDto: FileUploadDto) {
  // Implementation
}
```

## Error Message Patterns

### User-Friendly Messages
```typescript
// Clear, actionable error messages
const ERROR_MESSAGES = {
  SLUG_TAKEN: 'This slug is already taken. Please choose a different one.',
  INVALID_AMOUNT: 'Please enter a valid amount between 0.01 and 1,000,000.',
  INSUFFICIENT_FUNDS: 'Insufficient funds for this operation.',
  UPGRADE_REQUIRED: 'Please upgrade your plan to access this feature.',
  INVALID_RECIPIENT: 'The recipient you specified could not be found.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please wait a moment before trying again.'
};
```

### Internationalized Messages
```typescript
// Support for multiple languages
const getErrorMessage = (code: string, locale: string = 'en'): string => {
  const messages = {
    en: { SLUG_TAKEN: 'This slug is already taken.' },
    es: { SLUG_TAKEN: 'Este identificador ya está en uso.' },
    fr: { SLUG_TAKEN: 'Ce nom est déjà pris.' }
  };
  return messages[locale]?.[code] || messages.en[code];
};
```

## Testing Validation

### Unit Tests for Validators
```typescript
describe('SlugFormatValidator', () => {
  let validator: SlugFormatValidator;

  beforeEach(() => {
    validator = new SlugFormatValidator();
  });

  it('should accept valid slugs', () => {
    expect(validator.validate('my-product')).toBe(true);
    expect(validator.validate('product-v2')).toBe(true);
    expect(validator.validate('abc')).toBe(true);
  });

  it('should reject invalid slugs', () => {
    expect(validator.validate('My-Product')).toBe(false);   // Uppercase
    expect(validator.validate('-invalid')).toBe(false);     // Starts with hyphen
    expect(validator.validate('invalid-')).toBe(false);     // Ends with hyphen
    expect(validator.validate('ab')).toBe(false);           // Too short
  });
});
```

### Integration Tests for DTOs
```typescript
describe('CreateProductDto Validation', () => {
  it('should validate a valid product', async () => {
    const dto = plainToClass(CreateProductDto, {
      name: 'Wireless Headphones',
      slug: 'wireless-headphones',
      price: 99.99,
      categoryId: 'cat_electronics'
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject a slug with uppercase letters', async () => {
    const dto = plainToClass(CreateProductDto, {
      name: 'Wireless Headphones',
      slug: 'Wireless-Headphones',
      price: 99.99,
      categoryId: 'cat_electronics'
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('slug');
  });

  it('should reject a negative price', async () => {
    const dto = plainToClass(CreateProductDto, {
      name: 'Wireless Headphones',
      slug: 'wireless-headphones',
      price: -10,
      categoryId: 'cat_electronics'
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('price');
  });
});
```

## Maintenance Guidelines

When updating validation patterns:
1. **Maintain backward compatibility** where possible
2. **Update error messages** to be user-friendly and actionable  
3. **Add tests** for new validation rules
4. **Document breaking changes** in migration guides
5. **Consider internationalization** for error messages
6. **Review security implications** of validation changes
