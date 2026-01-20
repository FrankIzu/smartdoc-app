"""
Check TechWave Solutions receipt in database
Run this from manager-francis directory
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'manager-francis'))

from app import create_app, db
from models import File
import json

app = create_app()

with app.app_context():
    # Find TechWave receipt
    techwave_receipts = File.query.filter(
        File.json_data.cast(db.Text).like('%TechWave Solutions%')
    ).all()
    
    print(f"\n{'='*80}")
    print(f"Found {len(techwave_receipts)} TechWave receipt(s)")
    print(f"{'='*80}\n")
    
    for receipt in techwave_receipts:
        print(f"File ID: {receipt.id}")
        print(f"Filename: {receipt.original_filename}")
        print(f"File Kind: {receipt.file_kind}")
        print(f"Created: {receipt.created_at}")
        print(f"\nJSON Data:")
        
        if receipt.json_data:
            data = receipt.json_data if isinstance(receipt.json_data, dict) else json.loads(receipt.json_data)
            print(json.dumps(data, indent=2))
            
            # Calculate total from items
            if 'items' in data:
                calculated_total = 0
                print("\n\nItem-by-item calculation:")
                for item in data['items']:
                    price = float(item['price'].replace('$', '').replace(',', ''))
                    qty = int(item['quantity'])
                    subtotal = price * qty
                    calculated_total += subtotal
                    print(f"  {item['name']}: ${price:.2f} × {qty} = ${subtotal:.2f}")
                
                stored_total = data.get('total_amount', '0').replace('$', '').replace(',', '')
                stored_total = float(stored_total)
                
                print(f"\n  Calculated Total: ${calculated_total:.2f}")
                print(f"  Stored Total:     ${stored_total:.2f}")
                print(f"  Difference:       ${abs(calculated_total - stored_total):.2f}")
                
                if abs(calculated_total - stored_total) > 0.01:
                    print(f"\n  ⚠️  MISMATCH DETECTED!")
                    print(f"  The stored total doesn't match the sum of items.")
                    print(f"  Difference might be tax, fees, or a data error.")
        
        print(f"\n{'-'*80}\n")
