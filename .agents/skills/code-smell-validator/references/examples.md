# Code Smell Examples (Multi-Language)

This reference provides "Before" and "After" snippets for common code smells across different languages to help you identify and resolve them effectively.

---

## 1. Long Method
### JavaScript (TypeScript)
**Before (Long Method)**
```typescript
function processUserOrder(order: Order) {
  // 1. Validation
  if (!order.id || order.items.length === 0) {
    throw new Error("Invalid order");
  }
  // 2. Calculation
  let total = 0;
  for (const item of order.items) {
    total += item.price * item.quantity;
  }
  if (order.coupon) {
    total -= total * 0.1;
  }
  // 3. Database Update
  db.orders.save({ ...order, total });
  // 4. Notification
  emailService.send(order.userEmail, "Order Processed", `Total: ${total}`);
}
```

**After (Extract Method)**
```typescript
function processUserOrder(order: Order) {
  validateOrder(order);
  const total = calculateTotal(order);
  saveOrder(order, total);
  notifyUser(order, total);
}
```

---

## 2. Feature Envy
### Python
**Before (Feature Envy)**
```python
class Order:
    def __init__(self, customer):
        self.customer = customer

    def get_customer_address(self):
        # Envying Customer class data
        return f"{self.customer.street}, {self.customer.city}, {self.customer.zip}"
```

**After (Move Method)**
```python
class Customer:
    def full_address(self):
        return f"{self.street}, {self.city}, {self.zip}"

class Order:
    def get_customer_address(self):
        return self.customer.full_address()
```

---

## 3. Case Statement / Type Code
### Java
**Before (Switch on Type)**
```java
public double getSpeed(Bird bird) {
    switch (bird.type) {
        case EUROPEAN:
            return getBaseSpeed();
        case AFRICAN:
            return getBaseSpeed() - getLoadFactor() * bird.numberOfCoconuts;
        case NORWEGIAN_BLUE:
            return (bird.isNailed) ? 0 : getBaseSpeed(bird.voltage);
    }
    throw new RuntimeException("Should be unreachable");
}
```

**After (Polymorphism)**
```java
abstract class Bird {
    abstract double getSpeed();
}

class European extends Bird {
    double getSpeed() { return getBaseSpeed(); }
}

class African extends Bird {
    double getSpeed() { return getBaseSpeed() - getLoadFactor() * numberOfCoconuts; }
}
```

---

## 4. Primitive Obsession
### TypeScript
**Before (Primitives)**
```typescript
function createContact(email: string, phone: string) {
  if (!email.includes("@")) throw new Error("Invalid email");
  if (phone.length < 10) throw new Error("Invalid phone");
  // ...
}
```

**After (Value Object)**
```typescript
class Email {
  constructor(private value: string) {
    if (!value.includes("@")) throw new Error("Invalid email");
  }
  toString() { return this.value; }
}

function createContact(email: Email, phone: Phone) {
  // ...
}
```

---

## 6. Prop Drilling
### React (TypeScript)
**Before (Prop Drilling)**
```tsx
const App = () => {
  const [user, setUser] = useState({ name: "Alex" });
  return <Navbar user={user} />;
};

const Navbar = ({ user }) => {
  return <UserMenu user={user} />;
};

const UserMenu = ({ user }) => {
  return <span>{user.name}</span>;
};
```

**After (Context API / Composition)**
```tsx
// Using Context
const UserContext = createContext();

const App = () => {
  const [user, setUser] = useState({ name: "Alex" });
  return (
    <UserContext.Provider value={user}>
      <Navbar />
    </UserContext.Provider>
  );
};

const UserMenu = () => {
  const user = useContext(UserContext);
  return <span>{user.name}</span>;
};
```

---

## 7. God Component
### React (Expo)
**Before (God Component)**
```tsx
export const ProfileScreen = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('https://api.example.com/user')
      .then(res => res.json())
      .then(data => {
        setUser(data);
        setLoading(false);
      });
  }, []);

  const handleUpdate = async () => { /* 50 lines of update logic */ };

  if (loading) return <ActivityIndicator />;

  return (
    <View>
      <Text>{user.name}</Text>
      <Button title="Update" onPress={handleUpdate} />
      {/* 100 more lines of JSX */}
    </View>
  );
};
```

**After (Extract Hook + Smaller Components)**
```tsx
const useProfile = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // ... fetching logic ...
  return { user, loading, handleUpdate };
};

export const ProfileScreen = () => {
  const { user, loading, handleUpdate } = useProfile();
  
  if (loading) return <ActivityIndicator />;
  
  return <ProfileContent user={user} onUpdate={handleUpdate} />;
};
```

---

## 8. Any Obsession
### TypeScript
**Before (Any Everywhere)**
```typescript
function handleApiResponse(response: any) {
  console.log(response.data.user.id); // No type safety
}
```

**After (Strict Interfaces)**
```typescript
interface ApiResponse {
  data: {
    user: {
      id: string;
      name: string;
    };
  };
}

function handleApiResponse(response: ApiResponse) {
  console.log(response.data.user.id); // Autocomplete and type safety
}
```
